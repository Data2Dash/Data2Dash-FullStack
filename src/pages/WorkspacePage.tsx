import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { workspaceApi, WorkspaceSummary } from '../api/workspaceApi';
import { 
  FileText, MessageSquare, Search, 
  Clock, ArrowRight, Activity, Zap, 
  FolderOpen, Plus, BookMarked
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentLibrary } from '../store/useDocumentLibrary';
import { useCitationStore } from '../store/useCitationStore';
import { useSearchStore } from '../store/useSearchStore';
import { useChatStore } from '../store/useChatStore';

interface WorkspaceProps {
  summary: WorkspaceSummary | null;
}

export function WorkspacePage({ summary }: WorkspaceProps) {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const { docs } = useDocumentLibrary(user?.id ?? null, token);
  const setPendingOpenDocId = useCitationStore(s => s.setPendingOpenDocId);
  const { sessions: searchSessions, loadSession } = useSearchStore();
  const { setSessionId, setMessages } = useChatStore();

  const loading = !summary;

  const initials = user?.full_name 
    ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '??';

  const handleSessionClick = async (sid: string) => {
    if (!token) return;
    try {
      const data = await workspaceApi.getSessionMessages(sid, token);
      setSessionId(sid);
      const mapped = (data.messages || []).map((m: any) => ({
        role: m.role as 'user' | 'ai',
        content: m.content ?? '',
        sources: m.sources ?? undefined,
      }));
      setMessages(mapped);
      navigate('/');
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-3.5rem)] mt-14 bg-stone-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-sage-200 border-t-sage-600 rounded-full animate-spin" />
          <p className="text-stone-500 font-medium animate-pulse">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full bg-stone-50/50 relative overflow-y-auto custom-scrollbar">
      {/* Background decoration */}
      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-sage-100/40 to-transparent pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-sage-200/50 rounded-full blur-[100px] opacity-60 pointer-events-none" />
      <div className="absolute top-20 -left-20 w-72 h-72 bg-emerald-100/40 rounded-full blur-[80px] opacity-60 pointer-events-none" />

      <main className="relative max-w-6xl mx-auto px-6 py-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-10">
          <div className="flex items-center gap-4">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="h-16 w-16 rounded-2xl object-cover shadow-soft ring-2 ring-white" />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-stone-800 to-stone-900 text-white flex items-center justify-center text-xl font-bold shadow-soft ring-2 ring-white">
                {initials}
              </div>
            )}
            <div>
              <p className="text-xs font-bold tracking-widest text-sage-600 uppercase mb-1">
                Welcome back
              </p>
              <h1 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight">
                {summary?.workspace?.name || 'Your Workspace'}
              </h1>
            </div>
          </div>
          <div className="flex gap-3">
            <Link to="/upload" className="flex items-center gap-2 px-5 py-2.5 bg-white text-stone-700 rounded-2xl font-semibold shadow-sm border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-all active:scale-95">
              <FolderOpen className="h-4 w-4" />
              Upload
            </Link>
            <Link to="/" className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white rounded-2xl font-semibold shadow-soft hover:bg-stone-800 transition-all active:scale-95">
              <Plus className="h-4 w-4" />
              New Chat
            </Link>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Files', value: summary?.file_count ?? 0, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Chat Sessions', value: summary?.session_count ?? 0, icon: MessageSquare, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Recent Searches', value: summary?.recent_searches?.length ?? 0, icon: Search, color: 'text-amber-500', bg: 'bg-amber-50' },
            { label: 'Activity Score', value: 'High', icon: Activity, color: 'text-purple-500', bg: 'bg-purple-50' },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-3xl p-5 shadow-sm border border-stone-100/50 hover:shadow-md transition-all group">
              <div className="flex items-center gap-3 mb-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{stat.label}</p>
              </div>
              <p className="text-2xl font-extrabold text-stone-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Recent Files */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-stone-100/50">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-sage-100 flex items-center justify-center text-sage-600">
                  <FileText className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-bold text-stone-900">Recent Files</h2>
              </div>
              <button onClick={() => navigate('/upload')} className="text-sm font-semibold text-stone-400 hover:text-stone-900 flex items-center gap-1 transition-colors group">
                View all <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {summary?.recent_files.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 bg-stone-50 rounded-xl flex items-center justify-center mb-3">
                  <FolderOpen className="h-6 w-6 text-stone-300" />
                </div>
                <p className="text-stone-500 font-medium">No files uploaded yet.</p>
                <button onClick={() => navigate('/upload')} className="mt-4 text-sage-600 font-bold hover:text-sage-700">Upload your first file</button>
              </div>
            ) : (
              <div className="space-y-3">
                {summary?.recent_files.map(f => (
                  <div key={f.file_id} className="group flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 border border-transparent hover:border-stone-100 transition-all cursor-pointer">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-stone-400 group-hover:text-stone-600 transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900 truncate">{f.original_name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs font-medium text-stone-400">
                          <span className="uppercase tracking-wider">{f.file_type}</span>
                          <span>•</span>
                          <span>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-stone-400 shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(f.uploaded_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Column */}
          <div className="space-y-6">
            
            {/* Recent Sessions */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100/50">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-stone-900">Recent Chats</h2>
                </div>
              </div>

              {summary?.recent_sessions.length === 0 ? (
                <div className="py-8 text-center text-sm font-medium text-stone-400">
                  No active chats.
                </div>
              ) : (
                <div className="space-y-4">
                  {summary?.recent_sessions.map(s => (
                    <div key={s.session_id} onClick={() => handleSessionClick(s.session_id)} className="group cursor-pointer">
                      <p className="text-sm font-semibold text-stone-800 group-hover:text-emerald-600 transition-colors truncate mb-1">
                        {s.title}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                        <span>{s.session_type}</span>
                        {s.last_message_at && (
                          <>
                            <span>•</span>
                            <span>{new Date(s.last_message_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Searches — from backend database */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100/50">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                    <Zap className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-stone-900">Searches</h2>
                </div>
                <button
                  onClick={() => navigate('/search')}
                  className="text-sm font-semibold text-stone-400 hover:text-stone-900 flex items-center gap-1 transition-colors group"
                >
                  View all <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {!summary?.recent_searches?.length ? (
                <div className="py-8 text-center text-sm font-medium text-stone-400">
                  No search history.
                </div>
              ) : (
                <div className="space-y-4">
                  {summary.recent_searches.slice(0, 5).map(s => (
                    <div
                      key={s.search_id}
                      onClick={() => {
                        // Try to restore local cache, else just navigate
                        const local = searchSessions.find(ls => ls.query === s.query_text);
                        if (local) loadSession(local.id);
                        navigate('/search');
                      }}
                      className="group cursor-pointer"
                    >
                      <p className="text-sm font-semibold text-stone-700 group-hover:text-amber-600 transition-colors line-clamp-2 leading-snug mb-1">
                        &ldquo;{s.query_text}&rdquo;
                      </p>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                        {new Date(s.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Citation Library Grid */}
        <div className="mt-6 bg-white rounded-3xl p-6 shadow-sm border border-stone-100/50">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                <BookMarked className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-bold text-stone-900">Your Documents</h2>
            </div>
            <button 
              onClick={() => navigate('/citation')} 
              className="text-sm font-semibold text-stone-400 hover:text-stone-900 flex items-center gap-1 transition-colors group"
            >
              Open Library <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {docs.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-stone-50 rounded-xl flex items-center justify-center mb-3">
                <FileText className="h-6 w-6 text-stone-300" />
              </div>
              <p className="text-stone-500 font-medium">No documents saved yet.</p>
              <button onClick={() => navigate('/citation')} className="mt-4 text-sage-600 font-bold hover:text-sage-700">Create your first document</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {docs.map(doc => (
                <div 
                  key={doc.id}
                  onClick={() => {
                    setPendingOpenDocId(doc.id);
                    navigate('/citation');
                  }}
                  className="group p-5 rounded-2xl border border-stone-100 bg-stone-50/50 hover:bg-white hover:shadow-md hover:border-stone-200 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-8 w-8 rounded-lg bg-white shadow-sm border border-stone-100 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-stone-400 group-hover:text-purple-500 transition-colors" />
                    </div>
                  </div>
                  <h3 className="font-bold text-stone-900 text-base mb-1 truncate">{doc.title || 'Untitled'}</h3>
                  <div className="flex items-center gap-3 text-xs font-semibold text-stone-400">
                    <span className="flex items-center gap-1"><BookMarked className="h-3 w-3" /> {doc.citations.length} cites</span>
                    <span>•</span>
                    <span>{doc.wordCount} words</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
