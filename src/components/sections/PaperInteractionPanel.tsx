import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, Image as ImageIcon, Share2, Headphones, FileText, Quote,
  X, Send, Download, Loader2, Video, ExternalLink, ChevronLeft, Sparkles, Eye
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { generatePodcast, pollPodcastStatus, getPodcastAudioUrl, type PodcastStatusResponse } from '../../api/podcastService';
import { searchYouTubeVideos, type YouTubeVideo } from '../../api/youtubeService';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';

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
// Video Tab
// ────────────────────────────────────────────────────────────────────────────
function VideoTab({ paperTitle, paperAbstract }: { paperTitle: string; paperAbstract: string }) {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => { handleSearch(); }, []);

  const handleSearch = async () => {
    setIsLoading(true); setError(null); setHasSearched(true);
    try {
      const res = await searchYouTubeVideos(paperTitle, paperAbstract, 6);
      setVideos(res.videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find videos');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      <p className="text-sm text-stone-500">Finding related videos…</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
      <p className="text-sm text-stone-500">{error}</p>
      <Button variant="outline" onClick={handleSearch}>Try Again</Button>
    </div>
  );

  if (!videos.length && hasSearched) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
      <Video className="h-8 w-8 text-stone-300" />
      <p className="text-sm text-stone-500">No videos found for this paper.</p>
    </div>
  );

  return (
    <div className="p-5 h-full overflow-y-auto custom-scrollbar">
      <p className="text-xs text-stone-400 mb-4">{videos.length} related videos</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {videos.map((video) => (
          <a key={video.video_id} href={video.link} target="_blank" rel="noopener noreferrer"
            className="group block rounded-xl border border-stone-200 overflow-hidden hover:border-stone-300 hover:shadow-soft transition-all">
            <div className="relative aspect-video bg-stone-100">
              <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2">
                  <ExternalLink className="h-4 w-4 text-stone-700" />
                </div>
              </div>
            </div>
            <div className="p-3">
              <h5 className="text-xs font-semibold text-stone-800 line-clamp-2 mb-1">{video.title}</h5>
              <p className="text-[11px] text-stone-400">{video.channel}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Diagrams / Figures Tab
// ────────────────────────────────────────────────────────────────────────────
function DiagramTab({ sessionId, fileName }: { sessionId: string; fileName: string | null }) {
  const [figures, setFigures] = useState<Figure[]>([]);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [figureMessages, setFigureMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [figureInput, setFigureInput] = useState('');

  useEffect(() => {
    if (fileName && fileName !== 'paper.pdf') {
      fetchFigures();
    }
  }, [sessionId, fileName]);

  const fetchFigures = async () => {
    if (!fileName) return;
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/pdf/figures?session_id=${sessionId}&filename=${fileName}`);
      const data = await response.json();
      setFigures(data.figures || []);
    } catch (error) {
      console.error('Error fetching figures:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = async (figure: Figure) => {
    setIsAnalyzing(true); setAnalysis(null); setFigureMessages([]);
    try {
      const response = await fetch('http://localhost:8000/api/pdf/analyze-figure', {
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
      const response = await fetch('http://localhost:8000/api/pdf/analyze-figure', {
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

  if (isLoading || fileName === null || (fileName === 'paper.pdf' && !figures.length)) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      <p className="text-sm text-stone-500">
        {fileName === null ? "Importing paper..." : (fileName === 'paper.pdf' ? "Preparing document..." : "Extracting figures from PDF…")}
      </p>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!selectedFigure ? (
        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
          {figures.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <ImageIcon className="h-8 w-8 text-stone-200 mb-2" />
              <p className="text-sm text-stone-500">No figures found in this paper.</p>
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
              <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-soft">
                {isAnalyzing && !analysis ? "Analysing..." : analysis}
              </div>
              {figureMessages.map((msg, i) => (
                <div key={i} className={clsx("flex gap-2", msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <div className={clsx("rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[85%]", msg.role === 'ai' ? 'bg-white border border-stone-200' : 'bg-stone-900 text-white')}>
                    {msg.content}
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
function SummarizeTab({ sessionId, fileName, pdfUrl }: { sessionId: string; fileName: string | null; pdfUrl: string | null }) {
  const [data, setData] = useState<{title: string; summary: string; report_url: string | null} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fileName && fileName !== 'paper.pdf') {
      fetchSummary();
    }
  }, [sessionId, fileName]);

  const fetchSummary = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/pdf/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, filename: fileName, pdf_url: pdfUrl }),
      });
      const result = await response.json();
      if (response.ok) {
        setData(result);
      } else {
        setError(result.detail || "Failed to generate summary");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting to server");
    } finally {
      setIsLoading(false);
    }
  };

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
function KnowledgeGraphTab({ sessionId, fileName, pdfUrl }: { sessionId: string; fileName: string | null; pdfUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
          const res = await fetch('http://localhost:8000/api/pdf/knowledge-graph/chat', {
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
    if (fileName && fileName !== 'paper.pdf') {
      fetchKG();
    }
  }, [sessionId, fileName]);

  const fetchKG = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/pdf/knowledge-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, filename: fileName, pdf_url: pdfUrl }),
      });
      const result = await response.json();
      if (response.ok) {
        setUrl(result.url);
      } else {
        setError(result.detail || "Failed to generate Knowledge Graph");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting to server");
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
  onSendMessage?: (message: string) => Promise<{ response: string; sources?: Citation[] }>;
  isImporting?: boolean;
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
  isImporting = false
}: PaperInteractionPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [messages, setMessages] = useState<Message[]>([{ role: 'ai', content: initialMessage }]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use the provided fileName or fallback to the old calculation
  // IF propFileName is null, it means we ARE waiting for a filename (from import)
  // IF propFileName is undefined, it means we should guess it (old behavior)
  const safeTitle = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 50);
  const calculatedFileName = `${safeTitle}_${subtitle.split(' · ').pop()?.split('/').pop() || 'paper'}.pdf`;

  const fileName = propFileName === null ? null : (propFileName || calculatedFileName);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !onSendMessage) return;
    const userMsg = inputValue; setInputValue('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);
    try {
      const result = await onSendMessage(userMsg);
      setMessages((prev) => [...prev, { role: 'ai', content: result.response, citations: result.sources }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: 'Sorry, I encountered an error.' }]);
    } finally { setIsLoading(false); }
  };

  return (
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
          {[
            { id: 'chat', Icon: MessageSquare, label: 'Chat' },
            { id: 'view', Icon: Eye, label: 'View' },
            { id: 'diagram', Icon: ImageIcon, label: 'Figures' },
            { id: 'podcast', Icon: Headphones, label: 'Audio' },
            { id: 'video', Icon: Video, label: 'Videos' },
            { id: 'graph', Icon: Share2, label: 'Knowledge Graph' },
            { id: 'report', Icon: FileText, label: 'Summarize' },
          ].map(({ id, Icon, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${activeTab === id ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'chat' && (
          /* ... chat content ... */
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
                    <div className={clsx("rounded-2xl px-4 py-3 text-sm max-w-[80%] leading-relaxed", msg.role === 'ai' ? 'bg-stone-50 border border-stone-100 text-stone-800' : 'bg-stone-900 text-white')}>
                      {msg.content}
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
        )}

        {activeTab === 'view' && (
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
        )}

        {activeTab === 'diagram' && <DiagramTab sessionId={sessionId} fileName={fileName} />}
        {activeTab === 'podcast' && <PodcastTab paperTitle={title} paperContent={subtitle} />}
        {activeTab === 'video' && <VideoTab paperTitle={title} paperAbstract={subtitle} />}
        {activeTab === 'graph' && <KnowledgeGraphTab sessionId={sessionId} fileName={fileName} pdfUrl={pdfUrl || null} />}
        {activeTab === 'report' && <SummarizeTab sessionId={sessionId} fileName={fileName} pdfUrl={pdfUrl || null} />}
      </div>
    </div>
  );
}
