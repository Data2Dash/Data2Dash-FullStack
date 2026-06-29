"""
AI Video Presenter Agent
Generates cinematic presentation videos from document text.
Follows the same async-task pattern as PodcastAgent.
"""
import os
import re
import asyncio
import tempfile
import textwrap
import urllib.parse
from io import BytesIO
from typing import List, Optional, Callable

from PIL import Image, ImageDraw, ImageFont
import numpy as np
import requests as req_lib

import edge_tts
try:
    from moviepy import AudioFileClip, ImageClip, concatenate_videoclips
except ImportError:
    from moviepy.editor import AudioFileClip, ImageClip, concatenate_videoclips

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser

# ── Pydantic slide model ──────────────────────────────────────────────────────

class Slide(BaseModel):
    slide_type: str = Field(
        description="Pick one: 'title','hook','concept','timeline','quote','summary'. Never same type twice in a row."
    )
    title: str = Field(description="Slide title, max 8 words.")
    hook_question: str = Field(default="", description="hook: full rhetorical question.")
    hook_highlight: str = Field(default="", description="hook: 1-3 words to highlight.")
    concept_text: str = Field(default="", description="concept: 2-3 sentences. Wrap key terms in **bold**.")
    timeline_steps: List[str] = Field(default=[], description="timeline: 3-5 short step labels.")
    timeline_desc: List[str] = Field(default=[], description="timeline: one sentence per step.")
    quote_text: str = Field(default="", description="quote: striking key statement.")
    summary_points: List[str] = Field(default=[], description="summary: 3-5 recap points.")
    image_prompt: str = Field(description="Image generation prompt, specific and unique per slide.")
    script: str = Field(description="Spoken narration, MINIMUM 80 words, natural conversational sentences. No markdown.")

class PresentationModel(BaseModel):
    presentation_title: str
    slides: List[Slide]

# ── Design themes ─────────────────────────────────────────────────────────────

THEMES = [
    {"bg": [(252,248,240),(242,234,218)], "accent": (30,60,120),  "accent2": (200,80,40),  "text": (25,22,18),  "text2": (80,70,55),  "style": "cream"},
    {"bg": [(22,28,40),(15,20,30)],       "accent": (100,180,255),"accent2": (80,220,160), "text": (240,240,250),"text2": (160,180,210),"style": "dark"},
    {"bg": [(220,245,232),(200,235,215)], "accent": (30,140,90),  "accent2": (0,100,60),   "text": (15,50,30),  "text2": (50,100,70), "style": "mint"},
    {"bg": [(240,232,255),(228,215,252)], "accent": (110,60,200), "accent2": (200,60,180), "text": (40,20,80),  "text2": (90,60,140), "style": "lavender"},
    {"bg": [(255,235,225),(252,220,208)], "accent": (200,60,80),  "accent2": (240,140,60), "text": (60,20,20),  "text2": (120,50,40), "style": "rose"},
    {"bg": [(220,232,252),(205,220,245)], "accent": (20,80,180),  "accent2": (40,160,220), "text": (10,30,80),  "text2": (40,80,150), "style": "blueprint"},
]

W, H = 1280, 720
YELLOW_HL = (255, 213, 0)

# ── Font loader ───────────────────────────────────────────────────────────────

def _load_fonts():
    spec = {
        "xl":  [("arialbd.ttf", 80), ("DejaVuSans-Bold.ttf", 80)],
        "lg":  [("arialbd.ttf", 56), ("DejaVuSans-Bold.ttf", 56)],
        "md":  [("arialbd.ttf", 38), ("DejaVuSans-Bold.ttf", 38)],
        "sm":  [("arialbd.ttf", 28), ("DejaVuSans-Bold.ttf", 28)],
        "body":[("arial.ttf",   28), ("DejaVuSans.ttf",      28)],
        "cap": [("arial.ttf",   20), ("DejaVuSans.ttf",      20)],
        "lbl": [("arialbd.ttf", 20), ("DejaVuSans-Bold.ttf", 20)],
    }
    out = {}
    for k, opts in spec.items():
        for fname, sz in opts:
            try:
                out[k] = ImageFont.truetype(fname, sz); break
            except Exception:
                pass
        if k not in out:
            out[k] = ImageFont.load_default(size=opts[0][1])
    return out

# ── Drawing helpers ───────────────────────────────────────────────────────────

def _mw(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2]-bb[0], bb[3]-bb[1]

def _draw_wrapped(draw, text, x, y, font, fill, max_w, spacing=10) -> int:
    words = text.split()
    lines, cur = [], []
    for w in words:
        test = " ".join(cur + [w])
        if _mw(draw, test, font)[0] > max_w and cur:
            lines.append(" ".join(cur)); cur = [w]
        else:
            cur.append(w)
    if cur: lines.append(" ".join(cur))
    cy = y
    for line in lines:
        draw.text((x, cy), line, font=font, fill=fill)
        _, lh = _mw(draw, line, font)
        cy += lh + spacing
    return cy

def _parse_bold(text):
    highlights = re.findall(r'\*\*(.+?)\*\*', text)
    clean = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    return clean, highlights

def _gradient_bg(top, bot):
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(top[0] + t*(bot[0]-top[0]))
        g = int(top[1] + t*(bot[1]-top[1]))
        b = int(top[2] + t*(bot[2]-top[2]))
        draw.line([(0,y),(W,y)], fill=(r,g,b))
    return img

def _make_bg(theme):
    if theme["style"] == "dark":
        img = _gradient_bg(*theme["bg"])
        arr = np.array(img, dtype=np.int16)
        noise = np.random.default_rng(42).integers(-5, 5, arr.shape, dtype=np.int16)
        return Image.fromarray(np.clip(arr+noise,0,255).astype(np.uint8))
    if theme["style"] == "blueprint":
        img = Image.new("RGB", (W, H), (218,230,250))
        d = ImageDraw.Draw(img)
        for x in range(0, W, 32):
            d.line([(x,0),(x,H)], fill=(180,205,240), width=2 if x%160==0 else 1)
        for y in range(0, H, 32):
            d.line([(0,y),(W,y)], fill=(180,205,240), width=2 if y%160==0 else 1)
        return img
    return _gradient_bg(*theme["bg"])

# ── Illustration fetcher ──────────────────────────────────────────────────────

def _fetch_illustration(prompt: str, idx: int, w=560, h=440, dark=False) -> Image.Image:
    seed = (idx * 7919 + abs(hash(prompt[:40]))) % 999983
    suffix = ", flat vector illustration, vibrant, no text, bold shapes" if dark else \
             ", hand-drawn sketch, black ink on white, educational doodle, no text"
    full = prompt.rstrip(".") + suffix
    try:
        safe = urllib.parse.quote(full)
        url = f"https://image.pollinations.ai/prompt/{safe}?width={w}&height={h}&nologo=true&seed={seed}&model=flux"
        r = req_lib.get(url, timeout=30)
        r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGBA")
        img = img.resize((w, h), Image.LANCZOS)
        if np.array(img.convert("L")).std() < 5:
            raise ValueError("blank")
        return img
    except Exception:
        return _pil_fallback(prompt, w, h, idx)

def _pil_fallback(title, w, h, idx) -> Image.Image:
    import random
    rng = random.Random(idx * 31337)
    colors = [(100,160,220),(80,200,140),(220,100,80),(180,100,220),(240,180,60)]
    img = Image.new("RGBA", (w, h), (240,242,248,255))
    d = ImageDraw.Draw(img)
    bw, bh = w//5, h//5
    gap = w//8
    total = 3*bw + 2*gap
    sx = (w-total)//2
    cy_c = h//2
    words = [x for x in re.split(r'\W+', title) if len(x)>2][:3]
    if len(words) < 3: words = (words+["Key","Idea","Flow"])[:3]
    try: fnt = ImageFont.truetype("arial.ttf", 16)
    except: fnt = ImageFont.load_default(16)
    for i, lbl in enumerate(words):
        c = colors[i % len(colors)]
        bx = sx + i*(bw+gap)
        by = cy_c - bh//2
        d.rounded_rectangle([(bx,by),(bx+bw,by+bh)], radius=10, fill=(*c,200), outline=(80,80,80), width=2)
        tw2, th2 = d.textbbox((0,0), lbl, font=fnt)[2:]
        d.text((bx+(bw-tw2)//2, by+(bh-th2)//2), lbl, font=fnt, fill=(255,255,255))
        if i < 2:
            ax = bx+bw+4; ay = cy_c
            d.line([(ax,ay),(ax+gap-8,ay)], fill=(80,80,80), width=3)
            d.polygon([(ax+gap-8,ay-8),(ax+gap,ay),(ax+gap-8,ay+8)], fill=(80,80,80))
    for _ in range(10):
        rx=rng.randint(10,w-10); ry=rng.randint(10,h-10); rs=rng.randint(4,14)
        d.ellipse([(rx-rs,ry-rs),(rx+rs,ry+rs)], outline=(160,160,180), width=2)
    return img

# ── Slide renderers ───────────────────────────────────────────────────────────

def _brand(draw, fonts, theme):
    txt = "Data2Dash · AI Presenter"
    tw, _ = _mw(draw, txt, fonts["cap"])
    draw.text((W-tw-20, H-28), txt, font=fonts["cap"], fill=(*theme["text2"], 160))

def _render_title(slide, fonts, theme, illus) -> Image.Image:
    canvas = _make_bg(theme).convert("RGBA")
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); od = ImageDraw.Draw(ov)
    ac = theme["accent"]
    od.ellipse([(W-320,-80),(W+80,320)], fill=(*ac,25))
    od.ellipse([(-60,H-280),(260,H+60)], fill=(*ac,18))
    canvas = Image.alpha_composite(canvas, ov)
    draw = ImageDraw.Draw(canvas)
    if illus:
        ill = illus.resize((540,400), Image.LANCZOS)
        canvas.paste(ill, (W-560, H-420), ill)
    lines = textwrap.wrap(slide.title, width=18)
    ty = 80
    for i, line in enumerate(lines):
        if i == 0:
            lw, lh = _mw(draw, line, fonts["xl"])
            draw.rectangle([(60,ty+lh+4),(60+lw,ty+lh+10)], fill=(*ac,255))
        draw.text((60, ty), line, font=fonts["xl"], fill=tuple(theme["text"]))
        _, lh = _mw(draw, line, fonts["xl"])
        ty += lh + 8
    _brand(draw, fonts, theme)
    return canvas.convert("RGB")

def _render_hook(slide, fonts, theme, illus) -> Image.Image:
    canvas = _make_bg(theme).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    question = slide.hook_question or slide.title
    hl = (slide.hook_highlight or "").strip().lower()
    lines = textwrap.wrap(question, width=28)
    total_h = sum(_mw(draw, l, fonts["lg"])[1]+16 for l in lines)
    sy = (H-total_h)//2 - 10
    for line in lines:
        lw, lh = _mw(draw, line, fonts["lg"])
        ll = line.lower()
        if hl and hl in ll:
            idx = ll.index(hl)
            bef = line[:idx]; hlp = line[idx:idx+len(hl)]; aft = line[idx+len(hl):]
            bw,_ = _mw(draw,bef,fonts["lg"]); hw,hh2 = _mw(draw,hlp,fonts["lg"]); aw,_ = _mw(draw,aft,fonts["lg"])
            sx2 = (W-bw-hw-aw)//2
            if bef: draw.text((sx2,sy),bef,font=fonts["lg"],fill=tuple(theme["text"]))
            draw.rectangle([(sx2+bw-6,sy-4),(sx2+bw+hw+6,sy+hh2+5)],fill=YELLOW_HL)
            draw.text((sx2+bw,sy),hlp,font=fonts["lg"],fill=tuple(theme["text"]))
            if aft: draw.text((sx2+bw+hw,sy),aft,font=fonts["lg"],fill=tuple(theme["text"]))
        else:
            draw.text(((W-lw)//2,sy),line,font=fonts["lg"],fill=tuple(theme["text"]))
        sy += lh+16
    _brand(draw, fonts, theme)
    return canvas.convert("RGB")

def _render_concept(slide, fonts, theme, illus) -> Image.Image:
    canvas = _make_bg(theme).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    ac = theme["accent"]
    if slide.title:
        draw.text((52,30), slide.title, font=fonts["md"], fill=tuple(theme["text"]))
        tw, th = _mw(draw, slide.title, fonts["md"])
        draw.rectangle([(52,30+th+4),(52+tw,30+th+8)], fill=(*ac,255))
    pc = tuple(min(255,c+90) for c in ac)
    panel = Image.new("RGBA",(W-60,H-120),(*pc,180)); canvas.paste(panel,(28,100))
    if illus:
        iw2 = (W-60)//2-20; ih2 = H-160
        ill2 = illus.resize((iw2,ih2),Image.LANCZOS); canvas.paste(ill2,(38,110),ill2)
    tx = 28+(W-60)//2+14 if illus else 68
    tw2 = (W-60)//2-30 if illus else W-120
    clean, hl = _parse_bold(slide.concept_text or slide.title)
    draw = ImageDraw.Draw(canvas)
    _draw_wrapped(draw, clean, tx, 130, fonts["body"], tuple(theme["text"]), tw2, spacing=18)
    _brand(draw, fonts, theme)
    return canvas.convert("RGB")

def _render_timeline(slide, fonts, theme, illus) -> Image.Image:
    canvas = _make_bg(theme).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    ac, ac2 = theme["accent"], theme["accent2"]
    if slide.title:
        draw.text((52,28), slide.title, font=fonts["md"], fill=tuple(theme["text"]))
    steps = slide.timeline_steps or []; descs = slide.timeline_desc or []
    n = max(len(steps), 1)
    box_w = min(200,(W-100)//n-20); box_h = 160
    total_w = n*box_w+(n-1)*30; sx = (W-total_w)//2; cy_c = 260
    draw.line([(sx+box_w//2,cy_c+box_h//2),(sx+total_w-box_w//2,cy_c+box_h//2)],fill=(*ac,180),width=4)
    for i, step in enumerate(steps):
        bx = sx+i*(box_w+30); by = cy_c
        col = ac if i%2==0 else ac2
        lt = tuple(min(255,c+80) for c in col)
        draw.rounded_rectangle([(bx,by),(bx+box_w,by+box_h)],radius=14,fill=(*lt,240),outline=(*col,255),width=3)
        draw.ellipse([(bx+box_w//2-18,by-18),(bx+box_w//2+18,by+18)],fill=(*col,255))
        nw,nh = _mw(draw,str(i+1),fonts["lbl"])
        draw.text((bx+box_w//2-nw//2,by-nh//2),str(i+1),font=fonts["lbl"],fill=(255,255,255))
        _draw_wrapped(draw,step,bx+10,by+14,fonts["cap"],tuple(theme["text"]),box_w-20,8)
        if i < len(descs):
            _draw_wrapped(draw,descs[i],bx,by+box_h+12,fonts["cap"],tuple(theme["text2"]),box_w,6)
    _brand(draw, fonts, theme)
    return canvas.convert("RGB")

def _render_quote(slide, fonts, theme, illus) -> Image.Image:
    canvas = _make_bg(theme).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    ac = theme["accent"]
    draw.text((50,40), "\u201C", font=fonts["xl"], fill=(*ac,70))
    qt = slide.quote_text or slide.title
    lines = textwrap.wrap(qt, width=32)
    total_h = sum(_mw(draw,l,fonts["md"])[1]+14 for l in lines)
    sy = (H-total_h)//2-20
    for line in lines:
        lw, lh = _mw(draw, line, fonts["md"])
        draw.text(((W-lw)//2, sy), line, font=fonts["md"], fill=tuple(theme["text"]))
        sy += lh+14
    draw.rectangle([(W//2-70,sy+10),(W//2+70,sy+16)], fill=(*ac,255))
    if illus:
        ill2 = illus.resize((220,220),Image.LANCZOS); canvas.paste(ill2,(W-250,H-250),ill2)
    _brand(draw, fonts, theme)
    return canvas.convert("RGB")

def _render_summary(slide, fonts, theme, illus) -> Image.Image:
    canvas = _make_bg(theme).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    ac, ac2 = theme["accent"], theme["accent2"]
    title = slide.title or "Key Takeaways"
    tw, th = _mw(draw, title, fonts["lg"])
    draw.text(((W-tw)//2,32), title, font=fonts["lg"], fill=tuple(theme["text"]))
    draw.rectangle([((W-tw)//2,32+th+6),((W+tw)//2,32+th+12)], fill=(*ac,255))
    points = slide.summary_points or []
    avail = H-155-50; step = avail//max(len(points),1); py = 148
    for i, pt in enumerate(points):
        col = ac if i%2==0 else ac2
        draw.ellipse([(52,py+4),(84,py+36)],fill=(*col,255))
        nw2,nh2 = _mw(draw,str(i+1),fonts["lbl"])
        draw.text((68-nw2//2,py+4+(32-nh2)//2),str(i+1),font=fonts["lbl"],fill=(255,255,255))
        _draw_wrapped(draw,pt,102,py,fonts["body"],tuple(theme["text"]),W-260,8)
        py += step
    if illus:
        ill2 = illus.resize((260,260),Image.LANCZOS); canvas.paste(ill2,(W-290,H-290),ill2)
    _brand(draw, fonts, theme)
    return canvas.convert("RGB")

def _render_slide(slide, idx, fonts, theme, illus) -> Image.Image:
    t = slide.slide_type
    if t == "title":    return _render_title(slide,fonts,theme,illus)
    elif t == "hook":   return _render_hook(slide,fonts,theme,illus)
    elif t == "timeline": return _render_timeline(slide,fonts,theme,illus)
    elif t == "quote":  return _render_quote(slide,fonts,theme,illus)
    elif t == "summary": return _render_summary(slide,fonts,theme,illus)
    else:               return _render_concept(slide,fonts,theme,illus)

# ── TTS ───────────────────────────────────────────────────────────────────────

async def _tts(text: str, path: str, voice: str):
    clean = re.sub(r'[*#_`]', '', text)
    await edge_tts.Communicate(clean, voice).save(path)

def _gen_audio(text: str, path: str, voice: str):
    """Run TTS in a dedicated thread with its own event loop.
    asyncio.run() cannot be called inside FastAPI's already-running loop,
    so we spin up an isolated loop in a fresh thread."""
    import threading
    errors = []

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_tts(text, path, voice))
        except Exception as e:
            errors.append(e)
        finally:
            loop.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join()

    if errors:
        raise errors[0]

# ── Main Agent ────────────────────────────────────────────────────────────────

class VideoAgent:
    VOICES = [
        "en-US-AndrewNeural",
        "en-US-AvaNeural",
        "en-US-ChristopherNeural",
        "en-GB-SoniaNeural",
        "en-AU-WilliamNeural",
    ]

    def __init__(self, groq_api_key: str):
        self.api_key = groq_api_key
        self.fonts = _load_fonts()
        self.llm = ChatGroq(groq_api_key=groq_api_key, model_name="llama-3.3-70b-versatile", temperature=0.75)
        self.parser = PydanticOutputParser(pydantic_object=PresentationModel)

    def _plan_slides(self, text: str, num_slides: int) -> PresentationModel:
        fmt = self.parser.get_format_instructions().replace("{","{{").replace("}","}}")
        sys_prompt = f"""You are a creative educational video designer.
Produce EXACTLY {num_slides} slides. Be creative and varied.

SCRIPT: Every script MUST be at least 80 words. Natural spoken sentences, no markdown, no bullets.
SLIDE TYPES (never same type twice in a row):
  Slide 1 must be 'title'. Last slide must be 'summary' with 4-5 summary_points.
  Middle: 'hook' (hook_question + hook_highlight), 'concept' (concept_text with **bold** terms),
          'timeline' (timeline_steps + timeline_desc), 'quote' (quote_text).
IMAGE PROMPTS: Make each completely unique and specific. No text in images.
{fmt}"""
        prompt = ChatPromptTemplate.from_messages([("system", sys_prompt), ("human", "Document:\n\n{text}")])
        return (prompt | self.llm | self.parser).invoke({"text": text[:28000]})

    def generate_video(
        self,
        text: str,
        num_slides: int = 7,
        voice: str = "en-US-AndrewNeural",
        progress_callback: Optional[Callable[[str, int], None]] = None,
    ) -> bytes:
        def _prog(msg, pct):
            if progress_callback: progress_callback(msg, pct)

        _prog("Planning slides with AI…", 5)
        presentation = self._plan_slides(text, num_slides)

        work_dir = tempfile.mkdtemp(prefix="vid_")
        n = len(presentation.slides)
        slide_data = []

        for i, slide in enumerate(presentation.slides):
            base_pct = 10 + int(i / n * 70)
            _prog(f"Slide {i+1}/{n} — generating illustration…", base_pct)
            theme = THEMES[i % len(THEMES)]
            dark = theme["style"] == "dark"

            ill_path = os.path.join(work_dir, f"ill_{i}.png")
            ill = _fetch_illustration(slide.image_prompt, i, dark=dark)
            ill.save(ill_path)

            _prog(f"Slide {i+1}/{n} — rendering frame…", base_pct + 2)
            img_path = os.path.join(work_dir, f"img_{i}.png")
            _render_slide(slide, i, self.fonts, theme, ill).save(img_path)

            _prog(f"Slide {i+1}/{n} — generating voice…", base_pct + 4)
            audio_path = os.path.join(work_dir, f"audio_{i}.mp3")
            _gen_audio(slide.script, audio_path, voice)

            ac = AudioFileClip(audio_path)
            dur = ac.duration + 0.35
            ac.close()
            slide_data.append((img_path, audio_path, dur))

        _prog("Assembling final video…", 82)
        clips = []
        for img_path, audio_path, dur in slide_data:
            ac = AudioFileClip(audio_path)
            ic = ImageClip(img_path)
            try:
                vc = ic.with_duration(dur).with_audio(ac)
            except AttributeError:
                ic.duration = dur
                ic = ic.set_audio(ac)
                vc = ic
            clips.append(vc)

        out_path = os.path.join(work_dir, "output.mp4")
        concatenate_videoclips(clips, method="compose").write_videofile(
            out_path, fps=24, codec="libx264", audio_codec="aac",
            audio_fps=44100, preset="fast", threads=4, logger=None,
        )

        _prog("Finalising…", 98)
        with open(out_path, "rb") as f:
            video_bytes = f.read()

        # Cleanup
        import shutil
        try: shutil.rmtree(work_dir)
        except Exception: pass

        return video_bytes
