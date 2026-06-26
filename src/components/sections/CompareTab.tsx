import React, { useState } from 'react';
import { useTabActivity } from './TabActivityContext';
import { Loader2, Scale, Search, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface CompareTabProps {
  sessionId: string;
  fileName: string | null;
  pdfUrl: string | null;
  availableFiles?: { id: string; name: string; sessionId: string; url?: string }[];
  isSearchMode?: boolean;
}

export function CompareTab({ sessionId, fileName, pdfUrl, availableFiles, isSearchMode }: CompareTabProps) {
  const [targetId, setTargetId] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState<string>('');
  const [isComparing, setIsComparing] = useState(false);
  useTabActivity('compare', isComparing);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const handleCompare = async () => {
    setIsComparing(true);
    setError(null);
    setResult(null);

    try {
      let session_id_b = '';
      let filename_b = '';
      let pdf_url_b = '';

      if (isSearchMode) {
        const selected = availableFiles?.find(f => f.id === targetId);
        if (!selected) {
          throw new Error("Please select a paper from the search results to compare with.");
        }
        session_id_b = `compare_${Date.now()}`;
        filename_b = `${selected.id}.pdf`;
        pdf_url_b = selected.url || '';
      } else {
        const selected = availableFiles?.find(f => f.id === targetId);
        if (!selected) {
          throw new Error("Please select a file to compare with.");
        }
        session_id_b = selected.sessionId;
        filename_b = selected.name;
      }

      const res = await fetch(`${API_URL}/api/pdf/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id_a: sessionId,
          filename_a: fileName,
          pdf_url_a: pdfUrl,
          session_id_b: session_id_b,
          filename_b: filename_b,
          pdf_url_b: pdf_url_b || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to compare papers');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsComparing(false);
    }
  };

  const getVerdictColor = (dimension: string, verdict: string) => {
    const lower = verdict.toLowerCase();
    if (lower.includes('not enough evidence') || lower.includes('insufficient')) return 'text-stone-500 dark:text-zinc-400 bg-stone-100 dark:bg-zinc-800 border-stone-200 dark:border-zinc-700';
    
    // Dimension specific logic
    if (dimension === 'strengths' || dimension === 'novelty' || dimension === 'reproducibility') {
      if (lower.includes('multiple') || lower.includes('foundational') || lower.includes('broad') || lower.includes('stronger') || lower.includes('reasonably')) return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20';
      if (lower.includes('some') || lower.includes('efficiency') || lower.includes('partially')) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20';
      if (lower.includes('limited') || lower.includes('incremental') || lower.includes('weak')) return 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20';
    }
    
    if (dimension === 'weaknesses' || dimension === 'threats_to_validity') {
      if (lower.includes('no significant') || lower.includes('no threats')) return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20';
      if (lower.includes('explicit') || lower.includes('multiple threats')) return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20';
    }

    return 'text-stone-700 dark:text-zinc-300 bg-stone-50 dark:bg-zinc-950 border-stone-200 dark:border-zinc-700';
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-stone-50 dark:bg-zinc-950">
      <div className="p-5 bg-white dark:bg-zinc-900 border-b border-stone-200 dark:border-zinc-700 shrink-0">
        <h3 className="font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2 mb-4">
          <Scale className="h-5 w-5 text-stone-600 dark:text-zinc-400" />
          Critical Comparison
        </h3>

        {!result && (
          <div className="space-y-4 max-w-lg">
            <p className="text-sm text-stone-500 dark:text-zinc-400">
              Select another paper to compare against <strong>{fileName}</strong>.
            </p>

            {availableFiles && availableFiles.length > 0 ? (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 mb-2">
                  {isSearchMode ? "Select Paper from Search Results" : "Select Uploaded File"}
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-stone-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-sage-500/50 dark:focus:ring-emerald-500/50"
                >
                  <option value="">-- Choose a paper --</option>
                  {availableFiles.filter(f => f.name !== fileName).map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-stone-500 dark:text-zinc-400">No other papers available to compare.</p>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <Button onClick={handleCompare} disabled={isComparing || !targetId}>
              {isComparing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating Comparison…</>
              ) : (
                <><Scale className="h-4 w-4" /> Compare</>
              )}
            </Button>
          </div>
        )}
      </div>

      {isComparing && !result && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-stone-50 dark:bg-zinc-950">
          <Loader2 className="h-8 w-8 animate-spin text-stone-400 dark:text-zinc-500 mb-4" />
          <p className="font-semibold text-stone-800 dark:text-zinc-200 mb-1">Analyzing and comparing papers…</p>
          <p className="text-xs text-stone-500 dark:text-zinc-400">This involves a multi-step critical review pipeline.</p>
        </div>
      )}

      {result && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-2xl shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-zinc-500 mb-1">Paper A</h4>
              <p className="text-sm font-semibold text-stone-900 dark:text-zinc-100 line-clamp-2">{result.title_a}</p>
            </div>
            <div className="p-4 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-2xl shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-zinc-500 mb-1">Paper B</h4>
              <p className="text-sm font-semibold text-stone-900 dark:text-zinc-100 line-clamp-2">{result.title_b}</p>
            </div>
          </div>

          <div className="space-y-6">
            {result.comparison?.pairwise_comparisons?.map((comp: any, idx: number) => (
              <div key={idx} className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-stone-50 dark:bg-zinc-950 border-b border-stone-200 dark:border-zinc-700 flex justify-between items-center">
                  <h4 className="text-sm font-bold text-stone-800 dark:text-zinc-200 capitalize tracking-wide">{comp.dimension.replace(/_/g, ' ')}</h4>
                  <span className={clsx("text-xs font-semibold px-2 py-1 rounded-full border", getVerdictColor(comp.dimension, comp.comparative_judgement))}>
                    {comp.comparative_judgement}
                  </span>
                </div>
                <div className="p-5">
                  <p className="text-sm text-stone-600 dark:text-zinc-400 mb-4">{comp.rationale}</p>
                  {comp.evidence && comp.evidence.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 mb-2">Evidence:</p>
                      <ul className="space-y-1">
                        {comp.evidence.map((ev: string, i: number) => (
                          <li key={i} className="text-sm text-stone-500 dark:text-zinc-400 flex gap-2">
                            <span className="text-stone-300 dark:text-zinc-600">•</span>
                            <span>{ev}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {result.comparison?.comparison_markdown && (
              <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-2xl shadow-sm p-6">
                 <h4 className="text-sm font-bold text-stone-800 dark:text-zinc-200 tracking-wide mb-4 border-b border-stone-100 dark:border-zinc-800 pb-2">Overall Verdict</h4>
                 <div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                       {result.comparison.comparison_markdown}
                    </ReactMarkdown>
                 </div>
              </div>
            )}
          </div>
          
          <div className="mt-8 flex justify-center">
            <Button variant="outline" onClick={() => setResult(null)}>
              Start New Comparison
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
