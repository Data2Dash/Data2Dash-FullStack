import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, Cloud, X } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { PaperInteractionPanel } from './PaperInteractionPanel';

interface UploadedFile {
  name: string;
  size: string;
  status: 'ready' | 'processing';
}

export function PdfAnalysis() {
  const [files, setFiles] = useState<UploadedFile[]>([
    { name: "research_methodology_v2.pdf", size: "2.4 MB", status: "ready" },
    { name: "literature_review_draft.pdf", size: "1.1 MB", status: "ready" }
  ]);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (fileList: FileList | File[]) => {
    const newFiles = Array.from(fileList).map(file => ({
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      status: 'processing' as const
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
    
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      try {
        await fetch('http://localhost:8000/api/pdf/upload', {
          method: 'POST',
          body: formData
        });
        
        setFiles(prev => prev.map(f => 
          f.name === file.name ? { ...f, status: 'ready' } : f
        ));
      } catch (error) {
        console.error("Upload error:", error);
        setFiles(prev => prev.filter(f => f.name !== file.name)); // Remove failed uploads
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
  };

  return (
    <section className="bg-white py-20 min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/40 via-slate-50 to-white" id="upload">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-4 bg-white shadow-sm border-slate-200">Section 2</Badge>
          <h2 className="mb-4 text-4xl font-bold text-slate-900 tracking-tight">PDF Upload & Multi-Document Chat</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Analyze your own documents. Upload PDFs to chat, summarize, and extract insights across multiple files.</p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 h-[600px]">
          {/* Upload Area */}
          <div className="space-y-6 flex flex-col">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              multiple 
              accept=".pdf,.docx,.txt"
              onChange={handleFileSelect}
            />
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={handleDrop}
              className="group relative flex-1 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50/50 transition-all duration-300 hover:border-indigo-500 hover:bg-indigo-50/30 cursor-pointer overflow-hidden"
            >
              <div className="absolute inset-0 bg-grid-slate-100 opacity-50 pointer-events-none" />
              <div className="relative z-10 flex flex-col items-center text-center p-8 pointer-events-none">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-lg text-indigo-600 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                  <Cloud className="h-10 w-10" />
                </div>
                <p className="text-xl font-bold text-slate-900 mb-2">Drop PDFs here</p>
                <p className="text-slate-500 mb-6">or click to browse files</p>
                <Badge variant="outline" className="bg-white/80 backdrop-blur">Supports PDF, DOCX, TXT</Badge>
              </div>
            </div>

            <div className="space-y-3 bg-white/60 backdrop-blur-sm p-6 rounded-3xl border border-slate-100 shadow-sm overflow-y-auto max-h-[250px] custom-scrollbar">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 sticky top-0 bg-white/0 backdrop-blur-sm z-10">
                <FileText className="h-4 w-4 text-indigo-500" />
                Uploaded Documents ({files.length})
              </h3>
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-transform hover:scale-[1.01] group">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 truncate max-w-[150px] sm:max-w-[200px]">{file.name}</p>
                      <p className="text-xs text-slate-500">{file.size}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {file.status === 'ready' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRemoveFile(file.name); }}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interaction Panel */}
          <div className="h-full">
            <PaperInteractionPanel 
              title="Multi-Document Analysis"
              subtitle={`${files.length} documents selected`}
              initialMessage={
                <>
                  I'm analyzing your uploaded documents. I can help you <strong className="text-indigo-600">compare methodologies</strong>, <strong className="text-indigo-600">synthesize findings</strong>, or extract specific data points across all files.
                </>
              }
              onSendMessage={async (message) => {
                try {
                  const response = await fetch('http://localhost:8000/api/pdf/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: message, session_id: sessionId })
                  });
                  const data = await response.json();
                  return data.response;
                } catch (error) {
                  return "Error connecting to PDF agent. Please ensure the backend is running and files are uploaded.";
                }
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
