import streamlit as st
import os, re, asyncio, edge_tts, tempfile
from io import BytesIO
from pydub import AudioSegment
from typing import List
from pydantic import BaseModel, Field
from langchain_community.document_loaders import PyPDFLoader
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

# --- Python 3.13 / Audioop Fix ---
try:
    import audioop
except ImportError:
    pass 

# --- Structured Data Model ---
class PodcastLine(BaseModel):
    speaker: str = Field(description="Must be Alex or Jordan")
    text: str = Field(description="The dialogue text")

class PodcastScript(BaseModel):
    lines: List[PodcastLine]

# --- Page Config ---
st.set_page_config(page_title="Pro Podcast Studio", layout="wide")

async def generate_voice(text, voice):
    clean_text = re.sub(r'\[.*?\]', '', text)
    communicate = edge_tts.Communicate(clean_text, voice)
    data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio": data += chunk["data"]
    return data

# --- Sidebar ---
with st.sidebar:
    st.header("⚙️ Configuration")
    api_key = st.text_input("Groq API Key", type="password")
    
    st.subheader("Podcast Duration")
    duration_choice = st.select_slider(
        "Select Length",
        options=["Short", "Medium", "Long"],
        value="Medium",
        help="Short: ~2 min, Medium: ~5 min, Long: ~10 min"
    )
    
    st.subheader("Host Selection")
    v1 = st.selectbox("Alex (Host 1)", ["en-US-AndrewNeural", "en-GB-ThomasNeural"])
    v2 = st.selectbox("Jordan (Host 2)", ["en-US-AvaNeural", "en-GB-SoniaNeural"])
    use_music = st.checkbox("Add Background Music (bg.mp3)", value=True)

# --- Main Interface ---
st.title("🎙️ Professional Podcast Transformer")

if api_key:
    llm = ChatGroq(groq_api_key=api_key, model_name="llama-3.3-70b-versatile", temperature=0.7)
    parser = PydanticOutputParser(pydantic_object=PodcastScript)

    uploaded_file = st.file_uploader("Upload PDF", type=["pdf"])

    if uploaded_file:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(uploaded_file.getvalue())
            tmp_path = tmp.name

        if st.button("🚀 Generate Final Podcast"):
            try:
                # 1. Extraction (Taking more text for longer podcasts)
                char_limit = 10000 if duration_choice == "Short" else 20000 if duration_choice == "Medium" else 35000
                with st.spinner(f"Analyzing document ({duration_choice} mode)..."):
                    loader = PyPDFLoader(tmp_path)
                    docs = loader.load()
                    full_text = " ".join([d.page_content for d in docs])[:char_limit]

                # 2. Scripting with Dynamic Length
                with st.spinner(f"Drafting a {duration_choice} script..."):
                    # Map choice to instructions
                    length_instructions = {
                        "Short": "Write a concise 8-line script focusing only on the main takeaway.",
                        "Medium": "Write a detailed 18-line script exploring 3-4 key points with examples.",
                        "Long": "Write an extensive 30-line script. Deep dive into every detail, discuss implications, use analogies, and have a long debate."
                    }
                    
                    fmt_instructions = parser.get_format_instructions().replace("{", "{{").replace("}", "}}")
                    
                    main_prompt = ChatPromptTemplate.from_messages([
                        ("system", f"You are a professional producer. {length_instructions[duration_choice]}\n\n{fmt_instructions}"),
                        ("human", "Document Context: {full_text}")
                    ])
                    
                    chain = main_prompt | llm | parser
                    script_object = chain.invoke({"full_text": full_text})

                # 3. Audio Synthesis
                with st.status("Mastering Audio Layers...", expanded=True) as status:
                    final_audio = AudioSegment.empty()
                    progress_bar = st.progress(0)
                    total_lines = len(script_object.lines)
                    
                    for i, line in enumerate(script_object.lines):
                        st.write(f"🎙️ Recording {line.speaker} ({i+1}/{total_lines})...")
                        voice = v1 if "Alex" in line.speaker else v2
                        audio_bytes = asyncio.run(generate_voice(line.text, voice))
                        
                        seg = AudioSegment.from_file(BytesIO(audio_bytes), format="mp3")
                        final_audio += seg + AudioSegment.silent(duration=700)
                        progress_bar.progress((i + 1) / total_lines)

                    # 4. Background Music Mixing
                    if use_music and os.path.exists("bg.mp3"):
                        st.write("🎵 Mixing background track...")
                        bg = AudioSegment.from_file("bg.mp3")
                        loop_count = (len(final_audio) // len(bg)) + 1
                        bg_final = (bg * loop_count)[:len(final_audio)] - 28 
                        final_audio = final_audio.overlay(bg_final).fade_in(1000).fade_out(3000)

                    # 5. Export
                    out_buf = BytesIO()
                    final_audio.export(out_buf, format="mp3")
                    status.update(label=f"{duration_choice} Podcast Complete!", state="complete")

                    st.success(f"Successfully generated a {len(final_audio)/60000:.2f} minute episode.")
                    st.audio(out_buf)
                    st.download_button(label="📥 Download Podcast", data=out_buf.getvalue(), file_name="podcast.mp3", mime="audio/mp3")

            except Exception as e:
                st.error(f"An error occurred: {e}")
            finally:
                if os.path.exists(tmp_path): os.remove(tmp_path)
else:
    st.info("Enter your Groq API Key to begin.")