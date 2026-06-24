import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, Image as ImageIcon, Share2, Headphones, FileText, Quote,
  X, Send, Download, Loader2, Video, ExternalLink, ChevronLeft, Sparkles, Eye,
  BrainCircuit, CheckCircle2, XCircle, RotateCcw, ChevronRight, Trophy, RefreshCw, Scale
} from 'lucide-react';
import { CompareTab } from './CompareTab';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { generatePodcast, pollPodcastStatus, getPodcastAudioUrl, type PodcastStatusResponse } from '../../api/podcastService';
import { notify } from '../../store/useUIStore';
import { generateVideo, pollVideoStatus, getVideoDownloadUrl, VIDEO_VOICES, type VideoVoiceId, type VideoStatusResponse } from '../../api/videoService';

import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { cleanTableMarkdown } from '../../utils/tableUtils';
import { normalizeEquations } from '../../utils/mathUtils';
import { codeComponents } from '../ui/CodeBlock';
import { AiMessageRenderer } from '../ui/AiMessageRenderer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

import { TabActivityContext, useTabActivity } from './TabActivityContext';
import type { TabActivityMap } from './TabActivityContext';

interface Citation {
  content: string;
  metadata?: any;
  tool?: string;
  input?: string;
}

interface Message {
  role: 'user' | 'ai';
  content: string | React.ReactNode;
  citations?: Citation[];
  equations?: any[];
  tables?: any[];
}

interface Figure {
  url: string;
  local_path: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Podcast Tab
// ────────────────────────────────────────────────────────────────────────────
function PodcastTab({ paperTitle, paperContent }: { paperTitle: string; paperContent: string }) {
  const [length, setLength] = useState<'Short' | 'Medium' | 'Long'>('Medium');
  const [isGenerating, setIsGenerating] = useState(false);
  useTabActivity('podcast', isGenerating);
  const [status, setStatus] = useState<PodcastStatusResponse | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true); setError(null); setStatus(null); setAudioUrl(null);
    try {
      const response = await generatePodcast({ paper_content: `${paperTitle}\n\n${paperContent}`, length, add_music: true });
      const finalStatus = await pollPodcastStatus(response.task_id, setStatus);
      if (finalStatus.audio_url) setAudioUrl(getPodcastAudioUrl(response.task_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate podcast');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      {!audioUrl ? (
        <>
          <div className="p-4 rounded-2xl bg-stone-100 mb-5">
            <Headphones className="h-7 w-7 text-stone-600" />
          </div>
          <h4 className="text-lg font-semibold text-stone-900 mb-1">AI Podcast</h4>
          <p className="text-sm text-stone-500 max-w-xs mb-6">
            Generate a two-host AI conversation about this research paper.
          </p>
          <div className="flex gap-2 mb-6">
            {(['Short', 'Medium', 'Long'] as const).map((len) => (
              <button
                key={len}
                onClick={() => setLength(len)}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${length === len ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'}`}
              >
                {len}
                <span className="block text-[10px] opacity-60">{len === 'Short' ? '~2 min' : len === 'Medium' ? '~5 min' : '~10 min'}</span>
              </button>
            ))}
          </div>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Headphones className="h-4 w-4" /> Generate Podcast</>}
          </Button>
          {isGenerating && status && (
            <div className="w-full max-w-xs mt-6">
              <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                <span>{status.message}</span>
                <span className="font-semibold text-stone-700">{status.progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full bg-stone-900 transition-all rounded-full" style={{ width: `${status.progress}%` }} />
              </div>
            </div>
          )}
          {error && <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm max-w-xs">{error}</div>}
        </>
      ) : (
        <>
          <div className="p-4 rounded-2xl bg-sage-100 mb-5">
            <Headphones className="h-7 w-7 text-sage-700" />
          </div>
          <h4 className="text-lg font-semibold text-stone-900 mb-1">Podcast Ready</h4>
          <p className="text-sm text-stone-500 mb-6">Your {length.toLowerCase()} podcast is ready.</p>
          <audio controls src={audioUrl} className="w-full max-w-md mb-6 rounded-xl" />
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { const a = document.createElement('a'); a.href = audioUrl!; a.download = 'podcast.mp3'; a.click(); }}>
              <Download className="h-4 w-4" /> Download MP3
            </Button>
            <Button onClick={() => { setAudioUrl(null); setStatus(null); }}>Generate New</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AI Video Presenter Tab
// ────────────────────────────────────────────────────────────────────────────
function VideoTab({ paperTitle, paperAbstract }: { paperTitle: string; paperAbstract: string }) {
  const [numSlides, setNumSlides] = useState<4 | 6 | 8 | 10>(6);
  const [voice, setVoice] = useState<VideoVoiceId>(VIDEO_VOICES[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  useTabActivity('video', isGenerating);
  const [status, setStatus] = useState<VideoStatusResponse | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true); setError(null); setStatus(null); setVideoUrl(null); setTaskId(null);
    try {
      const res = await generateVideo({
        paper_title: paperTitle,
        paper_content: paperAbstract,
        num_slides: numSlides,
        voice,
      });
      setTaskId(res.task_id);
      await pollVideoStatus(res.task_id, setStatus);
      setVideoUrl(getVideoDownloadUrl(res.task_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate video');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setVideoUrl(null); setStatus(null); setTaskId(null); setError(null);
  };

  // ── Video ready screen ──
  if (videoUrl && taskId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-none px-5 py-3 bg-white border-b border-stone-100 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-stone-600" />
            <span className="text-sm font-semibold text-stone-900">AI Video Ready</span>
          </div>
          <div className="flex gap-2">
            <a
              href={videoUrl}
              download={`presentation_${taskId}.mp4`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-semibold hover:bg-stone-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download MP4
            </a>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-200 text-stone-600 rounded-lg text-xs font-semibold hover:bg-stone-50 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> New Video
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-stone-50">
          <video
            src={videoUrl}
            controls
            autoPlay
            className="w-full max-w-2xl rounded-2xl shadow-2xl border border-stone-200 bg-black"
            style={{ aspectRatio: '16/9' }}
          />
          <p className="text-xs text-stone-400 mt-3">1280×720 · 24fps · H.264</p>
        </div>
      </div>
    );
  }

  // ── Config / Generating screen ──
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      {!isGenerating ? (
        <>
          <div className="p-4 rounded-2xl bg-stone-100 mb-5">
            <Video className="h-7 w-7 text-stone-700" />
          </div>
          <h4 className="text-lg font-semibold text-stone-900 mb-1">AI Video Presenter</h4>
          <p className="text-sm text-stone-500 max-w-xs mb-7">
            Generate a cinematic presentation video with AI illustrations and narration.
          </p>

          {/* Slide count */}
          <div className="w-full max-w-xs mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 text-left">Slides</p>
            <div className="flex gap-2">
              {([4, 6, 8, 10] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setNumSlides(n)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    numSlides === n ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  {n}
                  <span className="block text-[10px] opacity-60">~{n * 45}s</span>
                </button>
              ))}
            </div>
          </div>

          {/* Voice selector */}
          <div className="w-full max-w-xs mb-7">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 text-left">Narrator Voice</p>
            <select
              value={voice}
              onChange={e => setVoice(e.target.value as VideoVoiceId)}
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-white text-sm text-stone-700 font-medium focus:outline-none focus:border-stone-400 transition-colors"
            >
              {VIDEO_VOICES.map(v => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm max-w-xs">{error}</div>
          )}

          <button
            onClick={handleGenerate}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-700 transition-all shadow-md active:scale-95"
          >
            <Video className="h-4 w-4" /> Generate Video
          </button>
        </>
      ) : (
        // Generating progress view
        <>
          <div className="relative mb-6">
            <div className="h-16 w-16 rounded-full border-4 border-stone-100 border-t-stone-900 animate-spin" />
            <Video className="h-6 w-6 text-stone-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <h4 className="font-semibold text-stone-800 mb-1">Generating your video…</h4>
          <p className="text-sm text-stone-500 mb-6 max-w-xs">
            AI is designing slides, generating illustrations, and recording narration.
          </p>
          {status && (
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                <span className="truncate pr-2">{status.message}</span>
                <span className="font-semibold text-stone-700 shrink-0">{status.progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full bg-stone-900 transition-all duration-700 rounded-full"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
              <p className="text-[10px] text-stone-400 mt-3">This takes 3–8 minutes depending on slide count.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Diagrams / Figures Tab
// ────────────────────────────────────────────────────────────────────────────
function DiagramTab({ sessionId, fileName, pdfUrl, activated = false }: { sessionId: string; fileName: string | null; pdfUrl: string | null; activated?: boolean }) {
  const [figures, setFigures] = useState<Figure[]>([]);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [isLoading, setIsLoading] = useState(!!fileName);
  useTabActivity('diagram', isLoading);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [figureMessages, setFigureMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [figureInput, setFigureInput] = useState('');

  useEffect(() => {
    if (activated && fileName) {
      setFigures([]);
      setError(null);
      fetchFigures();
    }
  }, [sessionId, fileName, activated]);

  const fetchFigures = async () => {
    if (!fileName) return;
    setIsLoading(true);
    setError(null);
    try {
      const url = `${API_URL}/api/pdf/figures?session_id=${sessionId}&filename=${encodeURIComponent(fileName)}${pdfUrl ? `&pdf_url=${encodeURIComponent(pdfUrl)}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${response.status}`);
      }
      const data = await response.json();
      setFigures(data.figures || []);
    } catch (e: any) {
      console.error('Error fetching figures:', e);
      const msg = e?.name === 'TypeError'
        ? 'Could not reach the server. Please check the backend is running and try again.'
        : (e.message || 'Failed to extract figures.');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = async (figure: Figure) => {
    setIsAnalyzing(true); setAnalysis(null); setFigureMessages([]);
    try {
      const response = await fetch(`${API_URL}/api/pdf/analyze-figure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_path: figure.local_path, session_id: sessionId }),
      });
      const data = await response.json();
      setAnalysis(data.analysis);
    } catch (error) {
      console.error('Error analyzing figure:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFigureChat = async () => {
    if (!figureInput.trim() || !selectedFigure || isAnalyzing) return;
    const userMsg = figureInput;
    setFigureInput('');
    setFigureMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsAnalyzing(true);
    try {
      const response = await fetch(`${API_URL}/api/pdf/analyze-figure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_path: selectedFigure.local_path, query: userMsg, session_id: sessionId }),
      });
      const data = await response.json();
      setFigureMessages(prev => [...prev, { role: 'ai', content: data.analysis }]);
    } catch (error) {
      console.error('Error in figure chat:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading || fileName === null) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      <p className="text-sm text-stone-500">
        {fileName === null ? "Waiting for document…" : "Extracting figures from PDF…"}
      </p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
      <ImageIcon className="h-8 w-8 text-stone-300 mb-1" />
      <p className="text-sm text-red-500 max-w-xs">{error}</p>
      <button
        onClick={fetchFigures}
        className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-700 transition-all"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!selectedFigure ? (
        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
          {figures.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
              <ImageIcon className="h-10 w-10 text-stone-200" />
              <div>
                <p className="text-sm font-medium text-stone-500">No figures found in this paper.</p>
                <p className="text-xs text-stone-400 mt-1">The PDF may not contain embedded images, or they may be too small.</p>
              </div>
              <button
                onClick={fetchFigures}
                className="mt-2 px-4 py-2 rounded-xl border border-stone-200 text-stone-600 text-xs font-semibold hover:bg-stone-100 transition-all"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-stone-400 mb-4">{figures.length} figures found in this paper</p>
              <div className="grid grid-cols-2 gap-3">
                {figures.map((fig, idx) => (
                  <div key={idx} onClick={() => { setSelectedFigure(fig); handleAnalyze(fig); }}
                    className="group relative aspect-square bg-stone-100 rounded-xl overflow-hidden cursor-pointer border border-stone-200 hover:border-stone-400 transition-all">
                    <img src={fig.url} alt={`Figure ${idx + 1}`} className="w-full h-full object-contain p-2" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col h-full bg-stone-50 overflow-hidden">
          <div className="px-4 py-3 bg-white border-b border-stone-100 flex items-center justify-between">
            <button onClick={() => setSelectedFigure(null)} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-400 hover:text-stone-900 transition-colors">
              <ChevronLeft className="h-3 w-3" /> Back
            </button>
            <span className="text-[10px] text-stone-400 font-medium">Analyze with Vision model</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
            <div className="bg-white p-4 border border-stone-100 rounded-xl">
              <img src={selectedFigure.url} alt="Selected Figure" className="w-full max-h-64 object-contain rounded-lg" />
            </div>
            <div className="space-y-3 text-sm text-stone-700 leading-relaxed">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-stone-900" />
                <h5 className="text-xs font-bold uppercase tracking-widest text-stone-900">AI Explanation</h5>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-soft prose prose-sm prose-stone max-w-none">
                {isAnalyzing && !analysis ? "Analysing..." : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={codeComponents}
                  >
                    {cleanTableMarkdown(normalizeEquations(analysis || ''))}
                  </ReactMarkdown>
                )}
              </div>
              {figureMessages.map((msg, i) => (
                <div key={i} className={clsx("flex gap-2", msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <div className={clsx("rounded-xl px-4 py-3 text-sm leading-relaxed max-w-[85%]", msg.role === 'ai' ? 'bg-white border border-stone-200 prose prose-sm prose-stone max-w-none' : 'bg-stone-900 text-white')}>
                    {msg.role === 'ai' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={codeComponents}
                      >
                        {cleanTableMarkdown(normalizeEquations(msg.content))}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 bg-white border-t border-stone-100 flex gap-2">
            <Input placeholder="Ask about this figure…" value={figureInput} onChange={(e) => setFigureInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFigureChat(); } }} className="rounded-xl text-xs h-9" disabled={isAnalyzing} />
            <button onClick={handleFigureChat} disabled={isAnalyzing || !figureInput.trim()} className="h-9 w-9 shrink-0 rounded-xl bg-stone-900 text-white flex items-center justify-center hover:bg-stone-700 disabled:opacity-40"><Send className="h-3 w-3" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Summarize Tab
// ────────────────────────────────────────────────────────────────────────────
// Summaries involve a full-document LLM pass — allow a generous ceiling before
// surfacing a clear timeout (mirrors the Upload tab's uploadApi timeout pattern).
const SUMMARY_TIMEOUT_MS = 180_000;

function SummarizeTab({ sessionId, fileName, pdfUrl, activated = false }: { sessionId: string; fileName: string | null; pdfUrl: string | null; activated?: boolean }) {
  const [data, setData] = useState<{title: string; summary: string; report_url: string | null} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  useTabActivity('report', isLoading);
  const [error, setError] = useState<string | null>(null);

  // Cancellation + stale-response guard so we only ever show the CURRENT file's
  // summary, even when the user switches/re-uploads files rapidly.
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const fetchSummary = useCallback(async () => {
    if (!fileName) return;
    // Cancel any in-flight summary and start a fresh, identifiable request.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myReqId = ++reqIdRef.current;
    const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

    // Reset state up front so a prior error/summary can't linger on retry.
    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch(`${API_URL}/api/pdf/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, filename: fileName, pdf_url: pdfUrl }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      // Ignore responses from a superseded request (stale-data guard).
      if (myReqId !== reqIdRef.current) return;

      if (response.ok) {
        const summary = (result?.summary || '').trim();
        if (!summary) {
          // Bad/empty model output — surface clearly instead of a blank panel.
          const msg = 'The summary came back empty. Please try again.';
          setError(msg);
          notify('Summary Failed', msg, 'error');
          return;
        }
        setData({ title: result.title || fileName, summary, report_url: result.report_url ?? null });
        notify('Summary Ready', `"${result.title || fileName}" has been summarised successfully.`, 'success');
      } else {
        const msg = result?.detail || 'Failed to generate summary';
        setError(msg);
        notify('Summary Failed', msg, 'error');
      }
    } catch (err) {
      // Swallow cancellations (newer request or unmount); surface real failures.
      if ((err as DOMException)?.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Error connecting to server';
      setError(msg);
      notify('Summary Failed', msg, 'error');
    } finally {
      clearTimeout(timeout);
      if (myReqId === reqIdRef.current) setIsLoading(false);
    }
  }, [sessionId, fileName, pdfUrl]);

  useEffect(() => {
    if (activated && fileName && fileName !== 'paper.pdf') {
      fetchSummary();
    }
    return () => abortRef.current?.abort();
  }, [fetchSummary, fileName, activated]);

  if (isLoading || fileName === null) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      <p className="text-sm text-stone-500">Generating comprehensive summary...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <p className="text-sm text-red-500 text-center max-w-sm">{error}</p>
      <Button onClick={fetchSummary} variant="outline">Try Again</Button>
    </div>
  );

  if (!data) return null;

  return (
    <div className="flex flex-col h-full bg-stone-50">
      <div className="px-5 py-4 bg-white border-b border-stone-200 shadow-sm flex items-center justify-between z-10 shrink-0">
         <h4 className="font-semibold text-stone-900 truncate max-w-[60%]">{data.title}</h4>
         {data.report_url && (
            <a href={data.report_url} download className="flex items-center gap-2 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-semibold hover:bg-stone-800 transition-colors">
              <Download className="h-3.5 w-3.5" /> Download Report
            </a>
         )}
      </div>
      <div className="p-6 overflow-y-auto custom-scrollbar prose prose-sm prose-stone max-w-none">
        <ReactMarkdown>{data.summary || "Summary not available."}</ReactMarkdown>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Knowledge Graph Tab
// ────────────────────────────────────────────────────────────────────────────
function KnowledgeGraphTab({ sessionId, fileName, pdfUrl, activated = false }: { sessionId: string; fileName: string | null; pdfUrl: string | null; activated?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  useTabActivity('graph', isLoading);
  const [error, setError] = useState<string | null>(null);

  const [chatNode, setChatNode] = useState<string | null>(null);
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (e.data && e.data.type === 'kg_node_click') {
        const node = e.data.node;
        setChatNode(node);
        setIsChatLoading(true);
        setChatResponse(null);

        try {
          const res = await fetch(`${API_URL}/api/pdf/knowledge-graph/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              filename: fileName,
              pdf_url: pdfUrl,
              query: `Explain everything you know about "${node}". What are its definitions, its properties, and crucially, what are its relationships with other entities in this paper? Provide detailed context for how it connects to the broader graph.`
            })
          });
          const data = await res.json();
          if (res.ok) setChatResponse(data.answer);
          else setChatResponse(`Error: ${data.detail || data.error}`);
        } catch (err: any) {
          setChatResponse(`Network Error: ${err.message}`);
        } finally {
          setIsChatLoading(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sessionId, fileName]);

  useEffect(() => {
    if (activated && fileName && fileName !== 'paper.pdf') {
      fetchKG();
    }
  }, [sessionId, fileName, activated]);

  const fetchKG = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/pdf/knowledge-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, filename: fileName, pdf_url: pdfUrl }),
      });
      const result = await response.json();
      if (response.ok) {
        setUrl(result.url);
        notify('Knowledge Graph Ready', 'Your interactive graph has been built. Click any node to explore connections.', 'success');
      } else {
        const msg = result.detail || 'Failed to generate Knowledge Graph';
        setError(msg);
        notify('Knowledge Graph Failed', msg, 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error connecting to server';
      setError(msg);
      notify('Knowledge Graph Failed', msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || fileName === null) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center bg-stone-50">
      <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      <p className="text-sm font-semibold text-stone-700">Extracting Knowledge Graph Entities...</p>
      <p className="text-xs text-stone-500">This requires analyzing chunks locally, and may take 1-2 minutes.</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center bg-stone-50">
      <p className="text-sm text-red-500 max-w-sm">{error}</p>
      <Button onClick={fetchKG} variant="outline">Try Again</Button>
    </div>
  );

  if (!url) return null;

  return (
    <div className="h-full w-full bg-stone-100 flex flex-col relative overflow-hidden">
        <div className="w-full flex justify-between items-center p-3 bg-white border-b border-stone-200 shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-stone-600" />
            <span className="text-sm font-medium text-stone-900">Interactive Knowledge Graph</span>
            </div>
            <a href={url} download="Knowledge_Graph.html" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-semibold hover:bg-stone-800 transition-colors">
            <ExternalLink className="h-3.5 w-3.5" /> Open Full Screen
            </a>
        </div>
        <iframe
            src={url}
            className="flex-1 w-full border-none bg-white"
            title="Knowledge Graph viewer"
        />

        {chatNode && (
          <div className="absolute top-16 right-4 w-1/3 min-w-[300px] bg-white border border-stone-200 rounded-xl shadow-2xl p-4 flex flex-col z-50 transition-all">
             <div className="flex justify-between items-center mb-3 border-b border-stone-100 pb-2">
                <h4 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                   <MessageSquare className="w-4 h-4 text-stone-600" />
                   {chatNode}
                </h4>
                <button onClick={() => setChatNode(null)} className="text-stone-400 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 p-1 rounded-md transition-colors">
                   <X className="w-4 h-4" />
                </button>
             </div>
             
             <div className="flex-1 overflow-y-auto max-h-[400px] text-sm text-stone-700 custom-scrollbar pr-2 mb-1">
                {isChatLoading ? (
                   <div className="flex items-center gap-2 text-stone-500 animate-pulse text-xs py-4">
                      <Sparkles className="w-4 h-4 text-stone-400" /> Synthesizing evidence from the graph...
                   </div>
                ) : (
                   <div className="prose prose-sm prose-stone max-w-none text-[13px]">
                     <ReactMarkdown>{chatResponse || ''}</ReactMarkdown>
                   </div>
                )}
             </div>
          </div>
        )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Quiz Tab
// ────────────────────────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
}

type QuizPhase = 'config' | 'loading' | 'playing' | 'results';

function QuizTab({ sessionId, fileName }: { sessionId: string; fileName: string | null }) {
  const [phase, setPhase] = useState<QuizPhase>('config');
  useTabActivity('quiz', phase === 'loading');
  const [numQuestions, setNumQuestions] = useState<5 | 10 | 20>(5);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = userAnswers.filter((ans, i) => {
    if (!ans || !questions[i]) return false;
    return ans.trim().toLowerCase() === questions[i].answer.trim().toLowerCase();
  }).length;

  const handleGenerate = async () => {
    if (!fileName) return;
    setPhase('loading');
    setError(null);
    setQuestions([]);
    setUserAnswers([]);
    setCurrentIdx(0);
    setSelectedOption(null);
    setAnswered(false);
    try {
      const res = await fetch(`${API_URL}/api/pdf/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, filename: fileName, num_questions: numQuestions, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to generate quiz');
      if (!data.questions?.length) throw new Error('No questions returned. Try again.');
      setQuestions(data.questions);
      setUserAnswers(new Array(data.questions.length).fill(null));
      setPhase('playing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setPhase('config');
    }
  };

  const handleSelectOption = (option: string) => {
    if (answered) return;
    setSelectedOption(option);
    setAnswered(true);
    setUserAnswers(prev => {
      const next = [...prev];
      next[currentIdx] = option;
      return next;
    });
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(i => i + 1);
      setSelectedOption(null);
      setAnswered(false);
    } else {
      setPhase('results');
    }
  };

  const handleRetake = () => {
    setCurrentIdx(0);
    setSelectedOption(null);
    setAnswered(false);
    setUserAnswers(new Array(questions.length).fill(null));
    setPhase('playing');
  };

  const handleNewQuiz = () => {
    setPhase('config');
    setQuestions([]);
  };

  // ── Config Screen ──
  if (phase === 'config') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 gap-8">
        <div className="text-center">
          <div className="inline-flex p-4 rounded-2xl bg-stone-100 mb-4">
            <BrainCircuit className="h-8 w-8 text-stone-700" />
          </div>
          <h4 className="text-xl font-bold text-stone-900 mb-1">Quiz Generator</h4>
          <p className="text-sm text-stone-500 max-w-xs">
            {fileName ? `Test your knowledge of "${fileName}"` : 'Upload a PDF first to generate a quiz.'}
          </p>
        </div>

        {fileName && (
          <div className="w-full max-w-sm space-y-6">
            {/* Number of Questions */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Questions</p>
              <div className="flex gap-2">
                {([5, 10, 20] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setNumQuestions(n)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      numQuestions === n
                        ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Difficulty</p>
              <div className="flex gap-2">
                {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      difficulty === d
                        ? d === 'Easy' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                          : d === 'Medium' ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                          : 'bg-red-600 text-white border-red-600 shadow-md'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              className="w-full py-3 rounded-xl bg-stone-900 text-white font-semibold text-sm hover:bg-stone-700 transition-all shadow-md active:scale-95"
            >
              Generate Quiz
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Loading Screen ──
  if (phase === 'loading') {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-5 p-8 text-center">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-stone-100 border-t-stone-900 animate-spin" />
          <BrainCircuit className="h-6 w-6 text-stone-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div>
          <p className="font-semibold text-stone-800 mb-1">Generating your quiz…</p>
          <p className="text-sm text-stone-500">Analyzing the document and crafting {numQuestions} {difficulty.toLowerCase()} questions.</p>
        </div>
      </div>
    );
  }

  // ── Playing Screen ──
  if (phase === 'playing' && questions.length > 0) {
    const q = questions[currentIdx];
    const progress = ((currentIdx) / questions.length) * 100;
    const isCorrect = selectedOption?.trim().toLowerCase() === q.answer.trim().toLowerCase();

    const optionLabels = ['A', 'B', 'C', 'D'];

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Progress Header */}
        <div className="flex-none px-5 pt-4 pb-3 bg-white border-b border-stone-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Question {currentIdx + 1} <span className="text-stone-300">/ {questions.length}</span>
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-700'
                : difficulty === 'Medium' ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-700'
            }`}>{difficulty}</span>
          </div>
          <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-stone-900 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question + Options */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-6 space-y-4">
          <div className="animate-fade-up">
            <p className="text-[15px] font-semibold text-stone-900 leading-relaxed mb-5">
              {q.question}
            </p>

            <div className="space-y-2.5">
              {q.options.map((opt, i) => {
                const isSelected = selectedOption === opt;
                const thisIsCorrect = opt.trim().toLowerCase() === q.answer.trim().toLowerCase();
                let btnClass = 'border-stone-200 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50';

                if (answered) {
                  if (thisIsCorrect) {
                    btnClass = 'border-emerald-400 bg-emerald-50 text-emerald-800';
                  } else if (isSelected && !thisIsCorrect) {
                    btnClass = 'border-red-300 bg-red-50 text-red-700';
                  } else {
                    btnClass = 'border-stone-100 bg-stone-50 text-stone-400 opacity-70';
                  }
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleSelectOption(opt)}
                    disabled={answered}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left transition-all duration-200 ${btnClass} disabled:cursor-default`}
                  >
                    <span className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                      answered && thisIsCorrect ? 'bg-emerald-500 text-white'
                        : answered && isSelected && !thisIsCorrect ? 'bg-red-500 text-white'
                        : 'bg-stone-100 text-stone-500'
                    }`}>
                      {answered && thisIsCorrect ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : answered && isSelected && !thisIsCorrect ? <XCircle className="h-3.5 w-3.5" />
                        : optionLabels[i]}
                    </span>
                    <span className="flex-1 leading-snug">{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Feedback + Next */}
            {answered && (
              <div className="mt-5 animate-fade-up">
                <div className={`p-3 rounded-xl mb-4 text-sm font-medium flex items-center gap-2 ${
                  isCorrect ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {isCorrect
                    ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> Correct! Well done.</>  
                    : <><XCircle className="h-4 w-4 shrink-0" /> The correct answer is: <span className="font-bold">{q.answer}</span></>}
                </div>
                <button
                  onClick={handleNext}
                  className="w-full py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-stone-700 transition-all active:scale-95"
                >
                  {currentIdx < questions.length - 1 ? (
                    <><span>Next Question</span><ChevronRight className="h-4 w-4" /></>
                  ) : (
                    <><Trophy className="h-4 w-4" /><span>See Results</span></>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Results Screen ──
  if (phase === 'results') {
    const pct = Math.round((score / questions.length) * 100);
    const circumference = 2 * Math.PI * 38;
    const strokeDashoffset = circumference - (pct / 100) * circumference;
    const grade = pct >= 80 ? { label: 'Excellent!', color: 'text-emerald-600' }
      : pct >= 60 ? { label: 'Good Job!', color: 'text-amber-600' }
      : { label: 'Keep Studying', color: 'text-red-500' };

    return (
      <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
        {/* Score Summary */}
        <div className="flex-none flex flex-col items-center py-8 px-6 bg-stone-50 border-b border-stone-100">
          <svg width="96" height="96" viewBox="0 0 96 96" className="mb-3">
            <circle cx="48" cy="48" r="38" fill="none" stroke="#e7e5e4" strokeWidth="8" />
            <circle
              cx="48" cy="48" r="38" fill="none"
              stroke={pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 48 48)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
            <text x="48" y="53" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1c1917">
              {pct}%
            </text>
          </svg>
          <h3 className={`text-xl font-bold mb-0.5 ${grade.color}`}>{grade.label}</h3>
          <p className="text-sm text-stone-500">
            You scored <span className="font-bold text-stone-800">{score}</span> out of <span className="font-bold text-stone-800">{questions.length}</span>
          </p>
          <div className="flex gap-2 mt-5">
            <button
              onClick={handleRetake}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-200 text-stone-700 text-xs font-semibold hover:bg-stone-100 transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retake
            </button>
            <button
              onClick={handleNewQuiz}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-700 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" /> New Quiz
            </button>
          </div>
        </div>

        {/* Per-question review */}
        <div className="divide-y divide-stone-100">
          {questions.map((q, i) => {
            const ua = userAnswers[i];
            const correct = ua?.trim().toLowerCase() === q.answer.trim().toLowerCase();
            return (
              <div key={i} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center ${
                    correct ? 'bg-emerald-100' : 'bg-red-100'
                  }`}>
                    {correct
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-stone-800 leading-snug mb-1.5">
                      <span className="text-stone-400 mr-1">Q{i + 1}.</span>{q.question}
                    </p>
                    {!correct && (
                      <div className="space-y-1">
                        {ua && (
                          <p className="text-xs text-red-500">
                            <span className="font-semibold">Your answer:</span> {ua}
                          </p>
                        )}
                        <p className="text-xs text-emerald-700">
                          <span className="font-semibold">Correct answer:</span> {q.answer}
                        </p>
                      </div>
                    )}
                    {correct && (
                      <p className="text-xs text-emerald-600 font-medium">{ua}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Main Panel
// ────────────────────────────────────────────────────────────────────────────

interface PaperInteractionPanelProps {
  title: string;
  subtitle: string;
  initialMessage: React.ReactNode;
  sessionId?: string;
  fileName?: string | null;  // Explicitly allow null to indicate "not ready yet"
  pdfUrl?: string | null;    // URL for the PDF viewer
  pdfSize?: string | null;   // Size of the PDF file
  onClose?: () => void;
  onSendMessage?: (message: string) => Promise<{ response: string; sources?: Citation[]; equations?: any[]; tables?: any[] }>;
  isImporting?: boolean;
  /** Pre-loaded chat history (e.g. restored from localStorage / DB) */
  chatHistory?: { role: 'user' | 'ai'; content: string }[];
  availableFilesToCompare?: { id: string; name: string; sessionId: string }[];
  alwaysShowCompare?: boolean;
}

export function PaperInteractionPanel({
  title,
  subtitle,
  initialMessage,
  sessionId = "default",
  fileName: propFileName,
  pdfUrl,
  pdfSize,
  onClose,
  onSendMessage,
  isImporting = false,
  chatHistory,
  availableFilesToCompare,
  alwaysShowCompare,
}: PaperInteractionPanelProps) {
  const [activeTab, _setActiveTab] = useState<string>('chat');
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['chat']));
  const setActiveTab = useCallback((id: string) => {
    _setActiveTab(id);
    setVisitedTabs(prev => prev.has(id) ? prev : new Set(prev).add(id));
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tab activity tracking — sub-tabs report loading state via context
  const [tabActivity, setTabActivity] = useState<TabActivityMap>({});
  const setTabActive = useCallback((tabId: string, active: boolean) => {
    setTabActivity(prev => {
      if (prev[tabId] === active) return prev;
      return { ...prev, [tabId]: active };
    });
  }, []);

  // Use the provided fileName or fallback to the old calculation
  // IF propFileName is null, it means we ARE waiting for a filename (from import)
  // IF propFileName is undefined, it means we should guess it (old behavior)
  const safeTitle = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 50);
  const calculatedFileName = `${safeTitle}_${subtitle.split(' · ').pop()?.split('/').pop() || 'paper'}.pdf`;

  const fileName = propFileName === null ? null : (propFileName || calculatedFileName);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  // Synchronize messages ONLY when the session actually changes (new file selected).
  // Do NOT include initialMessage in deps — it's a JSX element that creates a new
  // reference on every render, causing infinite re-sync and message duplication.
  const prevSessionRef = useRef(sessionId);
  const prevImportingRef = useRef(isImporting);
  useEffect(() => {
    if (prevSessionRef.current !== sessionId) {
      prevSessionRef.current = sessionId;
      const restored: Message[] = [
        { role: 'ai', content: initialMessage },
        ...(chatHistory || []).map((m) => ({ role: m.role as 'user'|'ai', content: m.content })),
      ];
      setMessages(restored);
    } else if (messages.length === 0) {
      // Initial mount — populate from history
      setMessages([
        { role: 'ai', content: initialMessage },
        ...(chatHistory || []).map((m) => ({ role: m.role as 'user'|'ai', content: m.content })),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Update the status message when import finishes (isImporting transitions false)
  useEffect(() => {
    if (prevImportingRef.current && !isImporting) {
      setMessages((prev) => {
        if (prev.length === 0) return [{ role: 'ai' as const, content: initialMessage }];
        return [{ ...prev[0], content: initialMessage }, ...prev.slice(1)];
      });
    }
    prevImportingRef.current = isImporting;
  }, [isImporting, initialMessage]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !onSendMessage) return;
    const userMsg = inputValue; setInputValue('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);
    try {
      const result = await onSendMessage(userMsg);
      setMessages((prev) => [...prev, {
        role: 'ai',
        content: result.response,
        citations: result.sources,
        equations: result.equations,
        tables: result.tables,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: 'Sorry, I encountered an error.' }]);
    } finally { setIsLoading(false); }
  };

  return (
    <TabActivityContext.Provider value={{ activity: tabActivity, setTabActive }}>
    <div className="flex flex-col h-full bg-white">
      <div className="flex-none px-5 pt-5 pb-0 border-b border-stone-100">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="font-semibold text-stone-900 text-sm leading-tight line-clamp-2">{title}</h3>
            <p className="text-xs text-stone-400 mt-0.5 truncate">{subtitle}</p>
          </div>
          {onClose && <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors shrink-0"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-3 no-scrollbar">
          {(() => {
            const tabs = [
              { id: 'chat', Icon: MessageSquare, label: 'Chat' },
              { id: 'quiz', Icon: BrainCircuit, label: 'Quiz' },
              { id: 'view', Icon: Eye, label: 'View' },
              { id: 'diagram', Icon: ImageIcon, label: 'Figures' },
              { id: 'podcast', Icon: Headphones, label: 'Audio' },
              { id: 'video', Icon: Video, label: 'Video AI' },
              { id: 'graph', Icon: Share2, label: 'Knowledge Graph' },
              { id: 'report', Icon: FileText, label: 'Summarize' },
            ];
            
            if (alwaysShowCompare || (availableFilesToCompare && availableFilesToCompare.length > 1)) {
              tabs.push({ id: 'compare', Icon: Scale, label: 'Compare' });
            }

            return tabs.map(({ id, Icon, label }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === id
                    ? id === 'quiz' ? 'bg-stone-900 text-white ring-2 ring-stone-900 ring-offset-1' : 'bg-stone-900 text-white'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
                }`}>
                <Icon className="h-3.5 w-3.5" />{label}
                {tabActivity[id] && activeTab !== id && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
            ));
          })()}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className={activeTab === 'chat' ? 'h-full' : 'hidden'}>
          <div className="flex h-full">
            <div className={`flex flex-col h-full transition-all ${selectedCitation ? 'w-1/2 border-r border-stone-100' : 'w-full'}`}>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-5 custom-scrollbar">
                {isImporting && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-blue-600 text-[11px] mb-4 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Processing full document for figure extraction...</span>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={clsx("h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold", msg.role === 'ai' ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700')}>{msg.role === 'ai' ? 'AI' : 'You'}</div>
                    <div className={clsx("rounded-2xl px-4 py-3 text-sm max-w-[85%] leading-relaxed", msg.role === 'ai' ? 'bg-stone-50 border border-stone-100 text-stone-800' : 'bg-stone-900 text-white')}>
                      {msg.role === 'ai' && typeof msg.content === 'string' ? (
                          <AiMessageRenderer
                            content={msg.content}
                            equations={msg.equations}
                            tables={msg.tables}
                            compact
                          />
                      ) : (
                        msg.content
                      )}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-stone-200/50">
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">Sources</p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.citations.map((cite, i) => (
                              <button key={i} onClick={() => setSelectedCitation(cite)} className="text-[11px] bg-white border border-stone-200 px-2 py-0.5 rounded-lg hover:bg-stone-50 transition-colors text-stone-600 flex items-center gap-1"><Quote className="h-2.5 w-2.5" />{cite.tool || `Source ${i + 1}`}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-stone-900 flex items-center justify-center text-[11px] font-semibold text-white shrink-0">AI</div>
                    <div className="bg-stone-50 border border-stone-100 rounded-2xl px-4 py-3 flex gap-1.5 items-center">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-stone-400" /><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-stone-400 transition-delay-150" /><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-stone-400 transition-delay-300" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-none px-4 py-3 border-t border-stone-100 bg-white flex gap-2">
                <Input placeholder="Ask a question…" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} disabled={isLoading} className="rounded-xl text-sm" />
                <button onClick={handleSend} disabled={isLoading || !inputValue.trim()} className="h-10 w-10 shrink-0 rounded-xl bg-stone-900 text-white flex items-center justify-center hover:bg-stone-700 disabled:opacity-40 transition-colors"><Send className="h-4 w-4" /></button>
              </div>
            </div>
            {selectedCitation && (
              <div className="w-1/2 flex flex-col bg-stone-50 animate-slide-right">
                <div className="px-4 py-3 border-b border-stone-200 bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-stone-500" /><span className="text-xs font-semibold text-stone-800">Source</span></div>
                  <button onClick={() => setSelectedCitation(null)} className="p-1 rounded-lg hover:bg-stone-100 text-stone-400"><ChevronLeft className="h-4 w-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 text-sm text-stone-600 leading-relaxed custom-scrollbar whitespace-pre-wrap">{selectedCitation.content}</div>
              </div>
            )}
          </div>
        </div>

        <div className={activeTab === 'view' ? 'h-full' : 'hidden'}>
          <div className="h-full w-full bg-stone-100 flex flex-col relative overflow-hidden">
            {pdfUrl ? (
              <div className="flex flex-col h-full">
                <div className="flex-none px-4 py-3 bg-white border-b border-stone-200 flex justify-between items-center shadow-sm z-10">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-stone-600" />
                    <span className="text-sm font-medium text-stone-900">Document Viewer</span>
                  </div>
                  <a href={pdfUrl} download className="flex items-center gap-2 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-semibold hover:bg-stone-800 transition-colors">
                    <Download className="h-3.5 w-3.5" /> Download PDF {pdfSize && `(${pdfSize})`}
                  </a>
                </div>
                <iframe
                  src={pdfUrl}
                  className="flex-1 w-full border-none"
                  title="Document viewer"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-stone-400 gap-4">
                <FileText className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">PDF viewer is preparing...</p>
              </div>
            )}
          </div>
        </div>

        {visitedTabs.has('quiz') && <div className={activeTab === 'quiz' ? 'h-full' : 'hidden'}><QuizTab sessionId={sessionId} fileName={fileName} /></div>}
        {visitedTabs.has('diagram') && <div className={activeTab === 'diagram' ? 'h-full' : 'hidden'}><DiagramTab sessionId={sessionId} fileName={fileName} pdfUrl={pdfUrl || null} activated={visitedTabs.has('diagram')} /></div>}
        {visitedTabs.has('podcast') && <div className={activeTab === 'podcast' ? 'h-full' : 'hidden'}><PodcastTab paperTitle={title} paperContent={subtitle} /></div>}
        {visitedTabs.has('video') && <div className={activeTab === 'video' ? 'h-full' : 'hidden'}><VideoTab paperTitle={title} paperAbstract={subtitle} /></div>}
        {visitedTabs.has('graph') && <div className={activeTab === 'graph' ? 'h-full' : 'hidden'}><KnowledgeGraphTab sessionId={sessionId} fileName={fileName} pdfUrl={pdfUrl || null} activated={visitedTabs.has('graph')} /></div>}
        {visitedTabs.has('report') && <div className={activeTab === 'report' ? 'h-full' : 'hidden'}><SummarizeTab sessionId={sessionId} fileName={fileName} pdfUrl={pdfUrl || null} activated={visitedTabs.has('report')} /></div>}
        {visitedTabs.has('compare') && <div className={activeTab === 'compare' ? 'h-full' : 'hidden'}><CompareTab sessionId={sessionId} fileName={fileName} pdfUrl={pdfUrl || null} availableFiles={availableFilesToCompare} isSearchMode={alwaysShowCompare} /></div>}
      </div>
    </div>
    </TabActivityContext.Provider>
  );
}
