import React from 'react';
import { motion } from 'framer-motion';
import { Search, FileText, Quote, ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const features = [
  {
    icon: Search,
    label: 'Paper Search',
    description: 'Search millions of papers from arXiv, IEEE, and Semantic Scholar. Chat with any paper using AI.',
    path: '/',
    color: 'bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300',
  },
  {
    icon: FileText,
    label: 'PDF Analysis',
    description: 'Upload your own documents and chat across multiple PDFs. Summarize, compare, and extract insights.',
    path: '/upload',
    color: 'bg-sage-50 dark:bg-emerald-500/10 text-sage-700 dark:text-emerald-400',
  },
  {
    icon: Quote,
    label: 'Citation Helper',
    description: 'Highlight text in your manuscript and auto-generate APA, MLA, and BibTeX citations instantly.',
    path: '/citation',
    color: 'bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300',
  },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export function Hero() {
  return (
    <section className="min-h-screen bg-stone-50 dark:bg-zinc-950 pt-14 flex flex-col">
      {/* Subtle dot background */}
      <div className="absolute inset-0 bg-dot-pattern opacity-30 pointer-events-none" />

      {/* Hero Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="max-w-2xl mx-auto"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 text-xs font-medium text-stone-600 dark:text-zinc-400 mb-8 shadow-soft">
            <Sparkles className="h-3 w-3 text-sage-600 dark:text-emerald-400" />
            AI-Powered Research Assistant
          </div>

          {/* Heading */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-stone-900 dark:text-zinc-100 mb-6 leading-[1.1]">
            Research,{' '}
            <span className="text-gradient">accelerated.</span>
          </h1>

          {/* Subheading */}
          <p className="text-lg sm:text-xl text-stone-500 dark:text-zinc-400 leading-relaxed max-w-xl mx-auto mb-10">
            Search academic papers, analyze documents, and generate citations — all with the power of AI.
          </p>

          {/* CTA */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 dark:hover:bg-zinc-700 transition-colors shadow-soft group"
          >
            Start Researching
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>

      {/* Bento Feature Grid */}
      <div className="relative max-w-5xl mx-auto w-full px-6 pb-24">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div key={feature.label} variants={itemVariants}>
                <Link to={feature.path} className="group block h-full">
                  <div className="h-full bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-700 p-6 shadow-soft hover:shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-stone-300 dark:hover:border-zinc-600 cursor-pointer">
                    <div className={`inline-flex p-2.5 rounded-xl mb-4 ${feature.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-stone-900 dark:text-zinc-100 mb-2 text-base">{feature.label}</h3>
                    <p className="text-sm text-stone-500 dark:text-zinc-400 leading-relaxed">{feature.description}</p>
                    <div className="mt-4 flex items-center text-sm font-medium text-stone-900 dark:text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
