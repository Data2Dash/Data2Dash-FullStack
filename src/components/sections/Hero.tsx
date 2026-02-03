import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { ArrowRight, Sparkles, FileText, Search, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate-950 pt-20 pb-32 lg:pt-32 lg:pb-40 min-h-screen flex items-center">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-grid-slate-900 [mask-image:linear-gradient(to_bottom,transparent,black,transparent)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/80 to-slate-950" />
      
      {/* Animated Blobs */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl animate-float-delayed" />

      <div className="container relative mx-auto px-4 text-center z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="mx-auto mb-8 flex max-w-fit items-center justify-center space-x-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-300 backdrop-blur-md shadow-[0_0_15px_rgba(99,102,241,0.3)]">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span>AI-Powered Research Assistant</span>
          </div>
          
          <h1 className="mb-8 text-5xl font-extrabold tracking-tight text-white sm:text-7xl lg:text-8xl">
            DATA<span className="text-gradient">2</span>DASH
          </h1>
          
          <p className="mx-auto mb-12 max-w-2xl text-lg text-slate-400 sm:text-xl leading-relaxed">
            Accelerate your academic journey. 
            <span className="text-slate-200 font-medium"> Search papers</span>, 
            <span className="text-slate-200 font-medium"> analyze documents</span>, and 
            <span className="text-slate-200 font-medium"> generate citations</span> with the power of next-gen AI.
          </p>
          
          <div className="flex flex-col items-center justify-center space-y-4 sm:flex-row sm:space-x-6 sm:space-y-0">
            <Link to="/search">
              <Button size="lg" className="group min-w-[200px] h-14 text-lg shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] transition-all duration-300">
                Start Researching
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="min-w-[200px] h-14 text-lg border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600 backdrop-blur-sm">
              View Demo
            </Button>
          </div>

          {/* Floating Icons */}
          <div className="mt-20 flex justify-center gap-8 opacity-50 grayscale transition-all duration-500 hover:grayscale-0 hover:opacity-100">
            <div className="flex flex-col items-center gap-2 animate-float">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <Search className="h-6 w-6 text-indigo-400" />
              </div>
              <span className="text-xs text-slate-500 font-medium">Smart Search</span>
            </div>
            <div className="flex flex-col items-center gap-2 animate-float-delayed">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <FileText className="h-6 w-6 text-purple-400" />
              </div>
              <span className="text-xs text-slate-500 font-medium">PDF Analysis</span>
            </div>
            <div className="flex flex-col items-center gap-2 animate-float">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <Database className="h-6 w-6 text-pink-400" />
              </div>
              <span className="text-xs text-slate-500 font-medium">Knowledge Graph</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
