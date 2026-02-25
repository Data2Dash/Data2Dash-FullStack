import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, Image as ImageIcon, Share2, Headphones, FileText, Quote,
  X, Send, Download, Loader2, Video, ExternalLink, ChevronLeft
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { generatePodcast, pollPodcastStatus, getPodcastAudioUrl, type PodcastStatusResponse } from '../../api/podcastService';
import { searchYouTubeVideos, type YouTubeVideo } from '../../api/youtubeService';

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
// Main Panel
// ────────────────────────────────────────────────────────────────────────────

interface PaperInteractionPanelProps {
  title: string;
  subtitle: string;
  initialMessage: React.ReactNode;
  onClose?: () => void;
  onSendMessage?: (message: string) => Promise<{ response: string; sources?: Citation[] }>;
}

export function PaperInteractionPanel({ title, subtitle, initialMessage, onClose, onSendMessage }: PaperInteractionPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [messages, setMessages] = useState<Message[]>([{ role: 'ai', content: initialMessage }]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !onSendMessage) return;
    const userMsg = inputValue;
    setInputValue('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);
    try {
      const result = await onSendMessage(userMsg);
      setMessages((prev) => [...prev, { role: 'ai', content: result.response, citations: result.sources }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-none px-5 pt-5 pb-0 border-b border-stone-100">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="font-semibold text-stone-900 text-sm leading-tight line-clamp-2">{title}</h3>
            <p className="text-xs text-stone-400 mt-0.5 truncate">{subtitle}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Pill Tab Bar */}
        <div className="flex gap-1 overflow-x-auto pb-3 no-scrollbar">
          {[
            { id: 'chat', Icon: MessageSquare, label: 'Chat' },
            { id: 'diagram', Icon: ImageIcon, label: 'Figures' },
            { id: 'podcast', Icon: Headphones, label: 'Audio' },
            { id: 'video', Icon: Video, label: 'Videos' },
            { id: 'report', Icon: FileText, label: 'Report' },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${activeTab === id
                ? 'bg-stone-900 text-white'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
                }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'chat' && (
          <div className="flex h-full">
            {/* Messages */}
            <div className={`flex flex-col h-full transition-all ${selectedCitation ? 'w-1/2 border-r border-stone-100' : 'w-full'}`}>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-5 custom-scrollbar">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${msg.role === 'ai' ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700'
                      }`}>
                      {msg.role === 'ai' ? 'AI' : 'You'}
                    </div>
                    {/* Bubble */}
                    <div className={`rounded-2xl px-4 py-3 text-sm max-w-[80%] leading-relaxed ${msg.role === 'ai'
                      ? 'bg-stone-50 border border-stone-100 text-stone-800'
                      : 'bg-stone-900 text-white'
                      }`}>
                      {msg.content}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-stone-200/50">
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">Sources</p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.citations.map((cite, i) => (
                              <button key={i} onClick={() => setSelectedCitation(cite)}
                                className="text-[11px] bg-white border border-stone-200 px-2 py-0.5 rounded-lg hover:bg-stone-50 transition-colors text-stone-600 flex items-center gap-1">
                                <Quote className="h-2.5 w-2.5" />
                                {cite.tool || `Source ${i + 1}`}
                              </button>
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
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-stone-400 inline-block" />
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-stone-400 inline-block" />
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-stone-400 inline-block" />
                    </div>
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="flex-none px-4 py-3 border-t border-stone-100 bg-white">
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask a question…"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    disabled={isLoading}
                    className="rounded-xl text-sm"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoading || !inputValue.trim()}
                    className="h-10 w-10 shrink-0 rounded-xl bg-stone-900 text-white flex items-center justify-center hover:bg-stone-700 disabled:opacity-40 transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Citation panel */}
            {selectedCitation && (
              <div className="w-1/2 flex flex-col bg-stone-50 animate-slide-right">
                <div className="px-4 py-3 border-b border-stone-200 bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-stone-500" />
                    <span className="text-xs font-semibold text-stone-800">Source</span>
                  </div>
                  <button onClick={() => setSelectedCitation(null)} className="p-1 rounded-lg hover:bg-stone-100 text-stone-400">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 text-sm text-stone-600 leading-relaxed custom-scrollbar">
                  {selectedCitation.tool && (
                    <div className="mb-4 p-3 bg-white rounded-xl border border-stone-200">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">Query</p>
                      <p className="text-stone-700 font-mono text-xs">{selectedCitation.input}</p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{selectedCitation.content}</p>
                </div>
              </div>
            )}
          </div>
        )}


        {activeTab === 'diagram' && (
          <div className="flex h-full flex-col items-center justify-center text-stone-400 gap-3 p-8 text-center">
            <div className="p-4 rounded-2xl bg-stone-100">
              <ImageIcon className="h-6 w-6 opacity-40" />
            </div>
            <p className="text-sm text-stone-500">Figure analysis coming soon.</p>
            <Button variant="outline" size="sm">Browse Figures</Button>
          </div>
        )}

        {activeTab === 'podcast' && <PodcastTab paperTitle={title} paperContent={subtitle} />}
        {activeTab === 'video' && <VideoTab paperTitle={title} paperAbstract={subtitle} />}

        {activeTab === 'report' && (
          <div className="p-5 space-y-3">
            {[
              { Icon: FileText, label: 'Full Analysis Report', meta: 'PDF · 2.4 MB', action: 'Download' },
              { Icon: Quote, label: 'Citation List', meta: 'BibTeX, APA, MLA', action: 'Copy' },
            ].map(({ Icon, label, meta, action }) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-stone-200 p-4 bg-white hover:border-stone-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-stone-100">
                    <Icon className="h-4 w-4 text-stone-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-900">{label}</p>
                    <p className="text-xs text-stone-400">{meta}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">{action}</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
