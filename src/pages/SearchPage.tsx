import React from 'react';
import { PaperSearch } from '../components/sections/PaperSearch';

export function SearchPage() {
  return (
    <div className="h-full bg-slate-50 dark:bg-zinc-950 overflow-y-auto custom-scrollbar">
      <PaperSearch />
    </div>
  );
}
