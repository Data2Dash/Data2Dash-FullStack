import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, X, Loader2, Plus, Files as FilesIcon, ChevronRight } from 'lucide-react';
import { PaperInteractionPanel } from './PaperInteractionPanel';
import { Button } from '../ui/Button';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UploadedFile {
  name: string;
  size: string;
  status: 'ready' | 'processing';
  url?: string;
}

export function PdfAnalysis() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [showUploadModal, setShowUploadModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (fileList: FileList | File[]) => {
    const newFiles = Array.from(fileList).map((file) => ({
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
      status: 'processing' as const,
    }));

    setFiles((prev) => {
      const updated = [...prev, ...newFiles];
      return updated;
    });

    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);
      try {
        const response = await fetch(`${API_URL}/api/pdf/upload`, { method: 'POST', body: formData });
        const data = await response.json();
        setFiles((prev) => {
          const updated = prev.map((f) =>
            (f.name === file.name ? { ...f, status: 'ready' as const, url: data.url } : f)
          );
          // If this is the first file being ready, select it
          if (updated.some(f => f.status === 'ready' && f.name === file.name)) {
            setActiveFileIndex((prevIdx) => prevIdx === null ? updated.findIndex(f => f.name === file.name) : prevIdx);
          }
          return updated;
        });
        setShowUploadModal(false);
      } catch {
        setFiles((prev) => prev.filter((f) => f.name !== file.name));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  };

  const currentFile = activeFileIndex !== null ? files[activeFileIndex] : null;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── EMPTY STATE (No files) ── */}
      {files.length === 0 && !showUploadModal ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 pt-24 max-w-4xl mx-auto w-full gap-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-stone-900 mb-2">PDF Analysis</h1>
            <p className="text-stone-500">Upload documents and chat across multiple files with AI.</p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative w-full aspect-[21/9] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 ${isDragging
              ? 'border-stone-500 bg-stone-100'
              : 'border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50'
              }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={(e) => e.target.files?.length && processFiles(e.target.files)}
            />
            <div className="p-4 rounded-2xl bg-stone-100 mb-4">
              <Upload className="h-7 w-7 text-stone-600" />
            </div>
            <p className="font-semibold text-stone-800 mb-1">Drop files here or click to browse</p>
            <p className="text-sm text-stone-400">PDF, DOCX, TXT supported</p>
          </div>
        </div>
      ) : (
        /* ── WORKSPACE MODE ── */
        <div className="flex-1 flex overflow-hidden pt-14">
          {/* Sidebar (Left) */}
          <div className="w-[380px] flex-none flex flex-col border-r border-stone-200 bg-stone-50 overflow-hidden">
            {/* File Switcher Header */}
            <div className="px-5 py-4 flex items-center justify-between bg-white border-b border-stone-100">
              <div className="flex items-center gap-2">
                <FilesIcon className="h-4 w-4 text-stone-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">Library</h4>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
                title="Upload More"
              >
                <Plus className="h-4 w-4" />
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept=".pdf"
                  onChange={(e) => e.target.files?.length && processFiles(e.target.files)}
                />
              </button>
            </div>

            {/* File List */}
            <div className="flex-none max-h-[160px] overflow-y-auto px-2 py-2 border-b border-stone-100 custom-scrollbar">
              <div className="space-y-1">
                {files.map((file, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveFileIndex(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${activeFileIndex === idx
                      ? 'bg-stone-900 text-white shadow-soft'
                      : 'hover:bg-stone-200 text-stone-700'
                      }`}
                  >
                    <FileText className={`h-4 w-4 shrink-0 ${activeFileIndex === idx ? 'text-stone-300' : 'text-stone-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{file.name}</p>
                      <p className={`text-[10px] ${activeFileIndex === idx ? 'text-stone-400' : 'text-stone-400'}`}>
                        {file.status === 'processing' ? 'Processing...' : file.size}
                      </p>
                    </div>
                    {file.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {activeFileIndex === idx && <ChevronRight className="h-3 w-3 text-stone-500" />}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Interaction Panel */}
            <div className="flex-1 overflow-hidden bg-white">
              <PaperInteractionPanel
                title={currentFile?.name ?? "Document Chat"}
                subtitle={currentFile ? `Analyzing ${currentFile.name}` : "Upload a PDF to start"}
                sessionId={sessionId}
                fileName={currentFile?.name}
                initialMessage={
                  <>
                    I'm ready to help you analyze your documents. {currentFile ? `Tell me what you'd like to know about **${currentFile.name}**.` : "Upload PDF documents to start chatting."}
                  </>
                }
                onSendMessage={async (message) => {
                  const response = await fetch(`${API_URL}/api/pdf/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      query: message,
                      session_id: sessionId,
                      fileName: currentFile?.name
                    }),
                  });
                  return await response.json();
                }}
              />
            </div>
          </div>

          {/* PDF Viewer (Right) */}
          <div className="flex-1 bg-stone-200 flex flex-col relative overflow-hidden">
            {currentFile?.url ? (
              <iframe
                src={currentFile.url}
                className="w-full h-full border-none shadow-xl"
                title="Document viewer"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-stone-400 gap-4">
                <FileText className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">Select a document from the library to view</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
