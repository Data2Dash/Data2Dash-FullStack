import React, { useState, useEffect } from 'react';
import { X, Key, Eye, EyeOff, Check, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function SettingsModal() {
  const { groqApiKey, setGroqApiKey, clearGroqApiKey, isSettingsOpen, closeSettings } = useSettingsStore();
  const [keyInput, setKeyInput] = useState(groqApiKey);
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [status, setStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    setKeyInput(groqApiKey);
    setStatus(groqApiKey ? 'valid' : 'idle');
  }, [groqApiKey, isSettingsOpen]);

  if (!isSettingsOpen) return null;

  const validateKey = async (key: string) => {
    if (!key.trim()) {
      setStatus('idle');
      return;
    }
    setValidating(true);
    try {
      const res = await fetch(`${API_URL}/api/settings/validate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key.trim() }),
      });
      setStatus(res.ok ? 'valid' : 'invalid');
    } catch {
      setStatus('invalid');
    }
    setValidating(false);
  };

  const handleSave = () => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      setGroqApiKey(trimmed);
    } else {
      clearGroqApiKey();
    }
    closeSettings();
  };

  const handleClear = () => {
    setKeyInput('');
    clearGroqApiKey();
    setStatus('idle');
  };

  const maskedKey = keyInput
    ? keyInput.slice(0, 7) + '•'.repeat(Math.max(0, keyInput.length - 11)) + keyInput.slice(-4)
    : '';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={closeSettings}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-stone-900">Settings</h2>
          <button onClick={closeSettings} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
            <X className="h-5 w-5 text-stone-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Groq API Key */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <Key className="h-4 w-4" />
              Groq API Key
            </label>
            <p className="text-xs text-stone-500 mb-3">
              Add your own Groq API key to avoid rate limits. Get one free at{' '}
              <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">
                console.groq.com
              </a>
            </p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setStatus('idle');
                }}
                onBlur={() => validateKey(keyInput)}
                placeholder="gsk_..."
                className="w-full px-4 py-2.5 pr-20 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                >
                  {showKey ? <EyeOff className="h-4 w-4 text-stone-400" /> : <Eye className="h-4 w-4 text-stone-400" />}
                </button>
                {status === 'valid' && <Check className="h-4 w-4 text-emerald-500" />}
                {status === 'invalid' && <AlertTriangle className="h-4 w-4 text-red-500" />}
              </div>
            </div>
            {status === 'invalid' && (
              <p className="text-xs text-red-500 mt-1.5">Invalid API key. Please check and try again.</p>
            )}
            {validating && (
              <p className="text-xs text-stone-400 mt-1.5">Validating...</p>
            )}
          </div>

          {/* Info box */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <p className="text-xs text-emerald-800">
              <strong>How it works:</strong> Your key is stored locally in your browser and sent with each request.
              It's never stored on our server. If no key is provided, the server's default key is used (with shared rate limits).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-stone-200 bg-stone-50">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm text-stone-600 hover:text-red-600 transition-colors rounded-lg hover:bg-stone-100"
          >
            Clear Key
          </button>
          <div className="flex gap-2">
            <button
              onClick={closeSettings}
              className="px-4 py-2 text-sm text-stone-600 rounded-lg hover:bg-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={status === 'invalid'}
              className="px-5 py-2 text-sm font-medium text-white bg-stone-900 rounded-xl hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
