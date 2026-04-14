import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

import { ChatPage } from './pages/ChatPage.tsx';
import { SearchPage } from './pages/SearchPage';
import { UploadPage } from './pages/UploadPage';
import { CitationPage } from './pages/CitationPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-stone-50 font-sans text-stone-900 selection:bg-sage-100 selection:text-sage-900 flex flex-col">
        <Routes>
          {/* Public auth routes – no Navbar wrapper, no footer */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Workspace — has Navbar but no footer */}
          <Route path="/citation" element={
            <ProtectedRoute>
              <>
                <Navbar />
                <CitationPage />
              </>
            </ProtectedRoute>
          } />

          {/* Standard routes with Navbar and Footer */}
          <Route path="*" element={
            <>
              <Navbar />
              <main className="flex-grow">
                <Routes>
                  <Route path="/" element={
                    <ProtectedRoute><ChatPage /></ProtectedRoute>
                  } />
                  <Route path="/search" element={
                    <ProtectedRoute><SearchPage /></ProtectedRoute>
                  } />
                  <Route path="/upload" element={
                    <ProtectedRoute><UploadPage /></ProtectedRoute>
                  } />
                </Routes>
              </main>
              <Footer />
            </>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
