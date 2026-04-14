import React from 'react';
import { FileText, Save, Quote } from 'lucide-react';

interface StatusBarProps {
  words: number;
  chars: number;
  citationCount: number;
  lastSaved: Date | null;
}

export function StatusBar({ words, chars, citationCount, lastSaved }: StatusBarProps) {
  const savedLabel = lastSaved
    ? `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Unsaved';

  return (
    <div className="flex items-center gap-4 text-[10px] font-semibold text-stone-400 select-none">
      <span className="flex items-center gap-1">
        <FileText className="h-3 w-3" />
        {words.toLocaleString()} words
      </span>
      <span className="hidden sm:inline text-stone-200">|</span>
      <span className="hidden sm:inline">{chars.toLocaleString()} chars</span>
      {citationCount > 0 && (
        <>
          <span className="text-stone-200">|</span>
          <span className="flex items-center gap-1 text-sage-500">
            <Quote className="h-3 w-3" />
            {citationCount} {citationCount === 1 ? 'citation' : 'citations'}
          </span>
        </>
      )}
      <span className="text-stone-200">|</span>
      <span className="flex items-center gap-1">
        <Save className="h-3 w-3" />
        {savedLabel}
      </span>
    </div>
  );
}
