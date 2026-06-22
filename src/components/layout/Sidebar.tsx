import React, { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare, Search, Upload, BookMarked, Home,
  Plus, FileText, Clock, Zap, FolderOpen, LogOut, Sparkles, Trash2
} from 'lucide-react';
import { clsx } from 'clsx';

import { useAuthStore, logoutWithSave } from '../../store/authStore';
import { useDocumentLibrary } from '../../store/useDocumentLibrary';
import { workspaceApi, WorkspaceSummary } from '../../api/workspaceApi';
import { useCitationStore } from '../../store/useCitationStore';
import { useChatStore } from '../../store/useChatStore';
import { useUIStore } from '../../store/useUIStore';
import { useSearchStore } from '../../store/useSearchStore';
import { usePdfStore } from '../../store/usePdfStore';
import { PanelLeftClose } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface SidebarProps {
  summary: WorkspaceSummary | null;
}

export function Sidebar({ summary }: SidebarProps) {
  const { user, isAuthenticated, token } = useAuthStore();
  const { docs } = useDocumentLibrary(user?.id ?? null, token);
  const setPendingOpenDocId = useCitationStore(s => s.setPendingOpenDocId);
  const { sessionId, setMessages, setSessionId, resetChat, triggerRefresh } = useChatStore();
  const { isSidebarOpen, toggleSidebar } = useUIStore();
  const { sessions: searchSessions, activeSessionId: activeSearchId, newSearch, loadSession } = useSearchStore();
  const pdfStore = usePdfStore();
  
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [deletedNames, setDeletedNames] = useState<Set<string>>(new Set());

  if (!isAuthenticated) return null;

  const navLinks = [
    { name: 'Workspace', path: '/workspace', icon: Home },
    { name: 'Chat', path: '/', icon: MessageSquare },
    { name: 'Search', path: '/search', icon: Search },
    { name: 'Upload', path: '/upload', icon: Upload },
    { name: 'Citation', path: '/citation', icon: BookMarked },
  ];

  const handleLogout = () => {
    logoutWithSave();
    navigate('/login');
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '??';

  // Contextual History rendering
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
      if (path !== '/') navigate('/');
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const renderHistory = () => {
    if (path === '/') {
      return (
        <>
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3 px-1">Recent Chats</p>
          <div className="space-y-1">
            {summary?.recent_sessions?.map(s => (
              <button 
                key={s.session_id} 
                onClick={() => handleSessionClick(s.session_id)}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-xl text-sm font-medium truncate transition-colors",
                  sessionId === s.session_id 
                    ? "bg-stone-900 text-white shadow-soft" 
                    : "hover:bg-stone-100 text-stone-600 hover:text-stone-900"
                )}
              >
                {s.title}
              </button>
            )) || <p className="text-xs text-stone-400 px-3">No recent chats.</p>}
          </div>
        </>
      );
    }

    if (path === '/search') {
      return (
        <>
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3 px-1">Recent Searches</p>
          <div className="space-y-1">
            {summary?.recent_searches?.length
              ? summary.recent_searches.slice(0, 20).map(s => (
                <button
                  key={s.search_id}
                  onClick={() => {
                    const local = searchSessions.find(ls => ls.query === s.query_text);
                    if (local) loadSession(local.id);
                    navigate('/search');
                  }}
                  className={clsx(
                    "w-full text-left px-3 py-2 rounded-xl text-sm font-medium truncate transition-colors",
                    searchSessions.find(ls => ls.query === s.query_text && ls.id === activeSearchId)
                      ? "bg-stone-900 text-white shadow-soft"
                      : "hover:bg-stone-100 text-stone-600 hover:text-stone-900"
                  )}
                >
                  {s.query_text}
                </button>
              ))
              : <p className="text-xs text-stone-400 px-3">No recent searches.</p>
            }
          </div>
        </>
      );
    }

    if (path === '/upload') {
      const getSessionId = (file: typeof summary.recent_files[0]): string => {
        if (file.session_id) return file.session_id;
        const parts = (file.storage_path || '').replace(/\\/g, '/').split('/');
        const idx = parts.findIndex(p => p === 'uploads');
        return idx >= 0 && parts.length > idx + 1 ? parts[idx + 1] : '';
      };

      const getFileUrl = (file: typeof summary.recent_files[0]): string => {
        if (file.url) return file.url;
        const sid = getSessionId(file);
        return sid ? `${API_URL}/api/uploads/${sid}/${file.filename}` : '';
      };

      const getDisplayName = (file: typeof summary.recent_files[0]): string =>
        file.original_name || file.filename || '';

      const handleFileDelete = async (e: React.MouseEvent, file: typeof summary.recent_files[0]) => {
        e.stopPropagation();
        const sid = getSessionId(file);
        const name = getDisplayName(file);
        if (!sid || !file.filename) return;

        setDeletedNames(prev => {
          const next = new Set(prev);
          next.add(file.file_id);
          next.add(name);
          next.add(file.filename);
          return next;
        });

        const activeFile = pdfStore.files.find(f => f.id === pdfStore.activeFileId);
        if (activeFile && activeFile.sessionId === sid) {
          pdfStore.newSession();
        }

        try {
          const res = await fetch(`${API_URL}/api/pdf/delete/${encodeURIComponent(file.filename)}`, { method: 'DELETE' });
          if (!res.ok) {
            setDeletedNames(prev => { const next = new Set(prev); next.delete(file.file_id); next.delete(name); next.delete(file.filename); return next; });
            return;
          }
          triggerRefresh();
        } catch {
          setDeletedNames(prev => { const next = new Set(prev); next.delete(file.file_id); next.delete(name); next.delete(file.filename); return next; });
        }
      };

      const handleFileRestore = async (file: typeof summary.recent_files[0]) => {
        const sid = getSessionId(file);
        if (!sid) return;

        const url = getFileUrl(file);
        const sizeStr = `${(file.size_bytes / 1024 / 1024).toFixed(1)} MB`;
        const name = getDisplayName(file);

        pdfStore.restoreSession(
          [{ id: file.file_id, name, size: sizeStr, status: 'ready', url, sessionId: sid }],
          file.file_id,
        );

        if (token) {
          try {
            const pdfSessions = summary?.recent_sessions?.filter(s => s.session_type === 'pdf') || [];
            for (const sess of pdfSessions) {
              if (sess.session_id === sid) {
                const data = await workspaceApi.getSessionMessages(sess.session_id, token);
                const mapped = (data.messages || []).map((m: any) => ({
                  role: m.role as 'user' | 'ai',
                  content: m.content ?? '',
                }));
                pdfStore.setChatMessagesForFile(file.file_id, mapped);
                break;
              }
            }
          } catch (err) {
            console.error('Failed to load PDF session messages:', err);
          }
        }

        if (path !== '/upload') navigate('/upload');
      };

      const handlePdfSessionClick = async (sess: typeof summary.recent_sessions[0]) => {
        if (!token) return;
        try {
          const data = await workspaceApi.getSessionMessages(sess.session_id, token);
          const mapped = (data.messages || []).map((m: any) => ({
            role: m.role as 'user' | 'ai',
            content: m.content ?? '',
          }));

          const matchingFile = summary?.recent_files?.find(f => getSessionId(f) === sess.session_id);

          if (matchingFile) {
            const url = getFileUrl(matchingFile);
            const sizeStr = `${(matchingFile.size_bytes / 1024 / 1024).toFixed(1)} MB`;
            pdfStore.restoreSession(
              [{ id: matchingFile.file_id, name: getDisplayName(matchingFile), size: sizeStr, status: 'ready', url, sessionId: sess.session_id }],
              matchingFile.file_id,
            );
          } else {
            pdfStore.restoreSession([], null);
          }
          if (matchingFile) {
            pdfStore.setChatMessagesForFile(matchingFile.file_id, mapped);
          }

          if (path !== '/upload') navigate('/upload');
        } catch (err) {
          console.error('Failed to load PDF session:', err);
        }
      };

      const pdfSessions = summary?.recent_sessions?.filter(s => s.session_type === 'pdf') || [];

      // Filter: exclude deleted files and deduplicate by display name
      const uniqueFiles = (() => {
        const raw = summary?.recent_files || [];
        const seen = new Set<string>();
        return raw.filter(f => {
          const name = getDisplayName(f);
          if (deletedNames.has(f.file_id) || deletedNames.has(name) || deletedNames.has(f.filename)) return false;
          if (seen.has(name)) return false;
          seen.add(name);
          return true;
        });
      })();

      return (
        <>
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3 px-1">Recent Uploads</p>
          <div className="space-y-1">
            {uniqueFiles.length
              ? uniqueFiles.map(f => (
                <div
                  key={f.file_id}
                  className="group flex items-center gap-1"
                >
                  <button
                    onClick={() => handleFileRestore(f)}
                    className="flex-1 min-w-0 text-left px-3 py-2 rounded-xl hover:bg-stone-100 text-sm font-medium text-stone-600 hover:text-stone-900 truncate flex items-center gap-2 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                    <span className="truncate">{f.original_name}</span>
                  </button>
                  <button
                    onClick={(e) => handleFileDelete(e, f)}
                    className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-stone-400 hover:text-red-500 transition-all"
                    title="Delete file"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
              : <p className="text-xs text-stone-400 px-3">No files uploaded.</p>
            }
          </div>

          {pdfSessions.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3 mt-5 px-1">PDF Chats</p>
              <div className="space-y-1">
                {pdfSessions.map(s => (
                  <button
                    key={s.session_id}
                    onClick={() => handlePdfSessionClick(s)}
                    className={clsx(
                      "w-full text-left px-3 py-2 rounded-xl text-sm font-medium truncate flex items-center gap-2 transition-colors",
                      pdfStore.files.find(f => f.id === pdfStore.activeFileId)?.sessionId === s.session_id
                        ? "bg-stone-900 text-white shadow-soft"
                        : "hover:bg-stone-100 text-stone-600 hover:text-stone-900"
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                    <span className="truncate">{s.title}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      );
    }

    if (path === '/citation' || path === '/workspace') {
      return (
        <>
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3 px-1">Your Library</p>
          <div className="space-y-1">
            {docs.slice(0, 15).map(doc => (
              <button 
                key={doc.id} 
                onClick={() => {
                  setPendingOpenDocId(doc.id);
                  if (path !== '/citation') navigate('/citation');
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-stone-100 text-sm font-medium text-stone-600 hover:text-stone-900 truncate flex items-center gap-2 transition-colors"
              >
                <BookMarked className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                <span className="truncate">{doc.title || 'Untitled'}</span>
              </button>
            )) || <p className="text-xs text-stone-400 px-3">Library is empty.</p>}
          </div>
        </>
      );
    }

    return null;
  };

  const renderNewButton = () => {
    let text = "New Chat";
    let icon = <Plus className="h-4 w-4" />;
    let target = "/";
    let action = () => {};

    if (path === '/') {
      text = "New Chat";
      action = () => resetChat();
    }
    else if (path === '/search') {
      text = "New Search";
      target = "/search";
      action = () => newSearch();
    }
    else if (path === '/upload') { text = "Upload File"; target = "/upload"; icon = <Upload className="h-4 w-4" />; action = () => pdfStore.newSession(); }
    else if (path === '/citation' || path === '/workspace') { text = "New Document"; target = "/citation"; }

    return (
      <Link 
        to={target} 
        onClick={action}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-700 transition-all active:scale-[0.98] shadow-soft mt-6 mb-4"
      >
        {icon} {text}
      </Link>
    );
  };

  return (
    <aside className={clsx(
      "h-screen flex flex-col bg-stone-50 border-r border-stone-200 shrink-0 transition-all duration-300 ease-in-out overflow-hidden relative",
      isSidebarOpen ? "w-64 lg:w-72" : "w-0 border-none"
    )}>
      
      {/* Top Branding & Toggle */}
      <div className="p-4 shrink-0 flex items-center justify-between">
        <Link to="/workspace" className="flex items-center gap-2.5 group pl-2 truncate">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold text-stone-900 text-sm tracking-tight truncate">
            DATA<span className="text-sage-600">2</span>DASH
          </span>
        </Link>
        <button 
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-stone-200/50 rounded-lg text-stone-400 hover:text-stone-900 transition-colors"
          title="Close sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Navigation */}
      <nav className="px-3 shrink-0">
        {navLinks.map((item) => {
          const isActive = path === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 mb-0.5',
                isActive
                  ? 'bg-stone-200/50 text-stone-900'
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-200/50'
              )}
            >
              <item.icon className={clsx("h-4 w-4", isActive ? "text-stone-700" : "text-stone-400")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Dynamic Contextual Action & History */}
      <div className="flex-1 flex flex-col px-3 overflow-hidden">
        {renderNewButton()}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {renderHistory()}
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-3 shrink-0 mt-auto border-t border-stone-200/60 relative">
        <button
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-stone-200/50 transition-colors text-left"
        >
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.full_name ?? ''} className="h-8 w-8 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-stone-900 truncate">{user?.full_name ?? user?.email}</p>
            <p className="text-xs text-stone-500 truncate">{user?.email}</p>
          </div>
        </button>

        {isUserMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-white border border-stone-200 rounded-xl shadow-panel p-1 z-50">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-lg font-medium"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>

    </aside>
  );
}
