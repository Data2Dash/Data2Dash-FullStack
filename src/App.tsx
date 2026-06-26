import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ToastContainer } from './components/ui/ToastContainer';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

import { ChatPage } from './pages/ChatPage.tsx';
import { SearchPage } from './pages/SearchPage';
import { UploadPage } from './pages/UploadPage';
import { CitationPage } from './pages/CitationPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { WorkspacePage } from './pages/WorkspacePage';

import { useAuthStore } from './store/authStore';
import { workspaceApi, WorkspaceSummary } from './api/workspaceApi';
import { useChatStore } from './store/useChatStore';
import { useUIStore } from './store/useUIStore';
import { PanelLeftOpen } from 'lucide-react';
import { SettingsModal } from './components/ui/SettingsModal';

function TabContainer() {
  const location = useLocation();
  const path = location.pathname;
  
  const { token, isAuthenticated } = useAuthStore();
  const { sessionId, refreshTrigger } = useChatStore();

  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const { isSidebarOpen, toggleSidebar } = useUIStore();

  // Global fetch for sidebar data — refetches on route change to stay fresh
  useEffect(() => {
    if (isAuthenticated && token) {
      workspaceApi.getSummary(token)
        .then(setSummary)
        .catch(console.error);
    }
  }, [isAuthenticated, token, path, sessionId, refreshTrigger]);

  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden bg-stone-50 dark:bg-zinc-950 font-sans text-stone-900 dark:text-zinc-100 selection:bg-sage-100 selection:text-sage-900">
        <Sidebar summary={summary} />
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative h-full overflow-hidden">
          <TopBar />

          {/* Floating Toggle Button (visible when sidebar is closed) */}
          {!isSidebarOpen && (
            <button
              onClick={toggleSidebar}
              className="absolute top-4 left-4 z-[100] p-2 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl shadow-soft text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-100 transition-all hover:scale-105 active:scale-95"
              title="Open sidebar"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}

          <div className={path === '/workspace' ? 'contents' : 'hidden'}>
            <WorkspacePage summary={summary} />
          </div>
          <div className={path === '/' ? 'contents' : 'hidden'}>
            <ChatPage />
          </div>
          <div className={path === '/search' ? 'contents' : 'hidden'}>
            <SearchPage />
          </div>
          <div className={path === '/upload' ? 'contents' : 'hidden'}>
            <UploadPage />
          </div>
          <div className={path === '/citation' ? 'contents' : 'hidden'}>
            <CitationPage />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* All protected routes are handled by the TabContainer to preserve state */}
        <Route path="*" element={<TabContainer />} />
      </Routes>
      {/* Toasts render above everything including modals */}
      <ToastContainer />
      <SettingsModal />
    </Router>
  );
}

export default App;
