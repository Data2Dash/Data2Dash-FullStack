import React from 'react';
import { Sparkles, Github, Twitter, Linkedin } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-stone-900 dark:bg-zinc-950 text-stone-400 dark:text-zinc-500">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sage-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-semibold text-white text-sm">
                DATA<span className="text-sage-400 dark:text-emerald-400">2</span>DASH
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-xs text-stone-500 dark:text-zinc-400">
              AI-powered research assistant. Search papers, analyze documents, and generate citations — faster.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-stone-300 dark:text-zinc-400">Platform</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/" className="hover:text-sage-400 dark:hover:text-emerald-400 transition-colors">Chat</Link></li>
              <li><Link to="/upload" className="hover:text-sage-400 dark:hover:text-emerald-400 transition-colors">PDF Analysis</Link></li>
              <li><Link to="/citation" className="hover:text-sage-400 dark:hover:text-emerald-400 transition-colors">Citation Helper</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-stone-300 dark:text-zinc-400">Connect</h4>
            <div className="flex gap-3">
              <a href="#" className="p-2 rounded-lg hover:bg-stone-800 dark:hover:bg-zinc-800 hover:text-white transition-colors"><Github className="h-4 w-4" /></a>
              <a href="#" className="p-2 rounded-lg hover:bg-stone-800 dark:hover:bg-zinc-800 hover:text-white transition-colors"><Twitter className="h-4 w-4" /></a>
              <a href="#" className="p-2 rounded-lg hover:bg-stone-800 dark:hover:bg-zinc-800 hover:text-white transition-colors"><Linkedin className="h-4 w-4" /></a>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-stone-800 dark:border-zinc-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-stone-600 dark:text-zinc-500">
          <p>© {new Date().getFullYear()} DATA2DASH. All rights reserved.</p>
          <p>Built with AI, for researchers.</p>
        </div>
      </div>
    </footer>
  );
}
