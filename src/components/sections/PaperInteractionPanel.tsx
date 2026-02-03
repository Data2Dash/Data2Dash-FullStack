import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Image as ImageIcon, Share2, Headphones, FileText, Quote, ChevronRight, X, Send, Download, Loader2, Video, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
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

interface PodcastTabProps {
  paperTitle: string;
  paperContent: string;
}

function PodcastTab({ paperTitle, paperContent }: PodcastTabProps) {
  const [length, setLength] = useState<'Short' | 'Medium' | 'Long'>('Medium');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<PodcastStatusResponse | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setStatus(null);
    setAudioUrl(null);

    try {
      // Start podcast generation
      const response = await generatePodcast({
        paper_content: `${paperTitle}\n\n${paperContent}`,
        length,
        add_music: true,
      });

      // Poll for completion
      const finalStatus = await pollPodcastStatus(
        response.task_id,
        (progressStatus) => {
          setStatus(progressStatus);
        }
      );

      // Set audio URL when completed
      if (finalStatus.audio_url) {
        setAudioUrl(getPodcastAudioUrl(response.task_id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate podcast');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `podcast-${paperTitle.slice(0, 30)}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="flex h-full flex-col p-6">
      {!audioUrl ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <Headphones className="h-10 w-10" />
          </div>
          <h4 className="mb-2 text-xl font-semibold text-slate-900">AI Podcast Generator</h4>
          <p className="mb-6 text-sm text-slate-500 max-w-md">
            Generate a conversational podcast with two AI hosts discussing this research paper.
          </p>

          {/* Length Selector */}
          <div className="mb-6 w-full max-w-md">
            <label className="block text-sm font-medium text-slate-700 mb-3">Podcast Length</label>
            <div className="grid grid-cols-3 gap-3">
              {(['Short', 'Medium', 'Long'] as const).map((len) => (
                <button
                  key={len}
                  onClick={() => setLength(len)}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${length === len
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                >
                  <div className="font-semibold">{len}</div>
                  <div className="text-xs mt-1">
                    {len === 'Short' && '~2 min'}
                    {len === 'Medium' && '~5 min'}
                    {len === 'Long' && '~10 min'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="mb-4"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Headphones className="mr-2 h-5 w-5" />
                Generate Podcast
              </>
            )}
          </Button>

          {/* Progress */}
          {isGenerating && status && (
            <div className="w-full max-w-md mt-4">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-600">{status.message}</span>
                <span className="text-indigo-600 font-semibold">{status.progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm max-w-md">
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Headphones className="h-10 w-10" />
          </div>
          <h4 className="mb-2 text-xl font-semibold text-slate-900">Podcast Ready!</h4>
          <p className="mb-6 text-sm text-slate-500">
            Your {length.toLowerCase()} podcast about "{paperTitle}" is ready to play.
          </p>

          {/* Audio Player */}
          <div className="w-full max-w-2xl mb-6">
            <audio
              controls
              src={audioUrl}
              className="w-full"
              style={{
                borderRadius: '8px',
                outline: 'none',
              }}
            >
              Your browser does not support the audio element.
            </audio>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button onClick={handleDownload} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download MP3
            </Button>
            <Button
              onClick={() => {
                setAudioUrl(null);
                setStatus(null);
              }}
            >
              Generate New Podcast
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface VideoTabProps {
  paperTitle: string;
  paperAbstract: string;
}

function VideoTab({ paperTitle, paperAbstract }: VideoTabProps) {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    // Auto-search when component mounts
    handleSearch();
  }, []);

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await searchYouTubeVideos(paperTitle, paperAbstract, 6);
      setVideos(response.videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search videos');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-6">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
          <p className="text-slate-600">Searching for relevant videos...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Video className="h-10 w-10" />
          </div>
          <h4 className="mb-2 text-lg font-semibold text-slate-900">Error Loading Videos</h4>
          <p className="mb-4 text-sm text-slate-500 text-center max-w-md">{error}</p>
          <Button onClick={handleSearch}>
            Try Again
          </Button>
        </div>
      ) : videos.length === 0 && hasSearched ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Video className="h-10 w-10" />
          </div>
          <h4 className="mb-2 text-lg font-semibold text-slate-900">No Videos Found</h4>
          <p className="mb-4 text-sm text-slate-500">No educational videos found for this paper.</p>
          <Button onClick={handleSearch}>
            Search Again
          </Button>
        </div>
      ) : (
        <div>
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-slate-900 mb-2">Educational Videos</h4>
            <p className="text-sm text-slate-500">
              Found {videos.length} video{videos.length !== 1 ? 's' : ''} about this paper
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[calc(100vh-300px)] custom-scrollbar pr-2">
            {videos.map((video) => (
              <a
                key={video.video_id}
                href={video.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg border border-slate-200 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all duration-200"
              >
                <div className="relative aspect-video bg-slate-100">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-3">
                      <ExternalLink className="h-6 w-6 text-indigo-600" />
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h5 className="font-semibold text-slate-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                    {video.title}
                  </h5>
                  <p className="text-xs text-slate-500 mb-2">{video.channel}</p>
                  <p className="text-sm text-slate-600 line-clamp-2">
                    {video.description}
                  </p>
                </div>
              </a>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Button variant="outline" onClick={handleSearch}>
              <Loader2 className="mr-2 h-4 w-4" />
              Refresh Videos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PaperInteractionPanelProps {
  title: string;
  subtitle: string;
  initialMessage: React.ReactNode;
  onClose?: () => void;
  onSendMessage?: (message: string) => Promise<{ response: string; sources?: Citation[] }>;
}

export function PaperInteractionPanel({ title, subtitle, initialMessage, onClose, onSendMessage }: PaperInteractionPanelProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'diagram' | 'graph' | 'podcast' | 'video' | 'report'>('chat');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: initialMessage }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      scrollContainerRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !onSendMessage) return;

    const userMessage = inputValue;
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const result = await onSendMessage(userMessage);
      setMessages(prev => [...prev, {
        role: 'ai',
        content: result.response,
        citations: result.sources
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: "Sorry, I encountered an error processing your request." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="h-full overflow-hidden border-slate-200 shadow-lg flex flex-col">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 flex-none">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="mb-2 text-xl">{title}</CardTitle>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="lg:hidden">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={activeTab === 'chat' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare className="mr-2 h-4 w-4" /> Chat
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'diagram' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('diagram')}
          >
            <ImageIcon className="mr-2 h-4 w-4" /> Diagrams
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'graph' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('graph')}
          >
            <Share2 className="mr-2 h-4 w-4" /> Graph
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'podcast' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('podcast')}
          >
            <Headphones className="mr-2 h-4 w-4" /> Audio
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'video' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('video')}
          >
            <Video className="mr-2 h-4 w-4" /> Video
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'report' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('report')}
          >
            <FileText className="mr-2 h-4 w-4" /> Report
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 min-h-0 bg-white relative">
        {activeTab === 'chat' && (
          <div className="flex h-full">
            <div className={`flex flex-col h-full transition-all duration-300 ${selectedCitation ? 'w-1/2 border-r border-slate-200' : 'w-full'}`}>
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"
              >
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${msg.role === 'ai' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'}`}>
                      {msg.role === 'ai' ? 'AI' : 'You'}
                    </div>
                    <div className={`rounded-lg p-3 text-sm max-w-[80%] ${msg.role === 'ai' ? 'bg-slate-100 text-slate-700' : 'bg-indigo-600 text-white'}`}>
                      {msg.content}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-200/50">
                          <p className="text-xs font-semibold text-slate-500 mb-2">Sources:</p>
                          <div className="flex flex-wrap gap-2">
                            {msg.citations.map((cite, i) => (
                              <button
                                key={i}
                                onClick={() => setSelectedCitation(cite)}
                                className="text-xs bg-white border border-slate-200 px-2 py-1 rounded hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-slate-600 flex items-center gap-1"
                              >
                                <Quote className="h-3 w-3" />
                                {cite.tool ? cite.tool : `Source ${i + 1}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                      AI
                    </div>
                    <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                      <div className="flex gap-1">
                        <span className="animate-bounce">.</span>
                        <span className="animate-bounce delay-100">.</span>
                        <span className="animate-bounce delay-200">.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-white">
                <div className="relative flex gap-2">
                  <Input
                    placeholder="Ask a question..."
                    className="pr-10"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                  />
                  <Button
                    size="sm"
                    className="h-10 w-10 p-0 shrink-0"
                    onClick={handleSend}
                    disabled={isLoading || !inputValue.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {selectedCitation && (
              <div className="w-1/2 flex flex-col h-full bg-slate-50 animate-in slide-in-from-right duration-300">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    <h4 className="font-semibold text-sm text-slate-900">Source Preview</h4>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCitation(null)} className="h-8 w-8 p-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-600 leading-relaxed">
                  {selectedCitation.tool && (
                    <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                      <p className="text-xs font-medium text-indigo-900 uppercase tracking-wider mb-1">Query</p>
                      <p className="text-indigo-700 font-mono text-xs">{selectedCitation.input}</p>
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none">
                    <p className="whitespace-pre-wrap">{selectedCitation.content}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'diagram' && (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
            <ImageIcon className="mb-4 h-12 w-12 opacity-20" />
            <p>Select a figure to analyze.</p>
            <Button variant="outline" className="mt-4">Browse Figures</Button>
          </div>
        )}

        {activeTab === 'graph' && (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
            <Share2 className="mb-4 h-12 w-12 opacity-20" />
            <p>Generating Knowledge Graph...</p>
            <div className="mt-4 h-1 w-24 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-1/2 animate-[shimmer_1s_infinite] bg-indigo-500" />
            </div>
          </div>
        )}

        {activeTab === 'podcast' && (
          <PodcastTab
            paperTitle={title}
            paperContent={subtitle}
          />
        )}

        {activeTab === 'video' && (
          <VideoTab
            paperTitle={title}
            paperAbstract={subtitle}
          />
        )}

        {activeTab === 'report' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-indigo-600" />
                <div>
                  <p className="font-medium">Full Analysis Report</p>
                  <p className="text-xs text-slate-500">PDF • 2.4 MB</p>
                </div>
              </div>
              <Button variant="outline" size="sm">Download</Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <Quote className="h-5 w-5 text-indigo-600" />
                <div>
                  <p className="font-medium">Citation List</p>
                  <p className="text-xs text-slate-500">BibTeX, APA, MLA</p>
                </div>
              </div>
              <Button variant="outline" size="sm">Copy</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
