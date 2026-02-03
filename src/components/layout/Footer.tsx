import React from 'react';
import { Sparkles, Github, Twitter, Linkedin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-slate-900 py-12 text-slate-400">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4 flex items-center gap-2 font-bold text-xl text-white">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <span>DATA<span className="text-indigo-500">2</span>DASH</span>
            </div>
            <p className="max-w-xs text-sm">
              Empowering researchers with AI-driven insights. 
              Accelerate your discovery process today.
            </p>
          </div>
          
          <div>
            <h4 className="mb-4 font-semibold text-white">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-indigo-400">Paper Search</a></li>
              <li><a href="#" className="hover:text-indigo-400">PDF Analysis</a></li>
              <li><a href="#" className="hover:text-indigo-400">Citation Helper</a></li>
              <li><a href="#" className="hover:text-indigo-400">Pricing</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-white">Connect</h4>
            <div className="flex space-x-4">
              <a href="#" className="hover:text-white"><Github className="h-5 w-5" /></a>
              <a href="#" className="hover:text-white"><Twitter className="h-5 w-5" /></a>
              <a href="#" className="hover:text-white"><Linkedin className="h-5 w-5" /></a>
            </div>
          </div>
        </div>
        
        <div className="mt-12 border-t border-slate-800 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} DATA2DASH. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
