import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Send, Loader2, Sparkles, ExternalLink,
  ChevronLeft, ChevronRight, SlidersHorizontal, X,
  BookOpen, BarChart2, TrendingUp, Tag, Filter,
  BarChart, Users, Award, Globe, Calendar, Flame,
} from 'lucide-react';
import { clsx } from 'clsx';
import { PaperInteractionPanel } from './PaperInteractionPanel';
import { useSearchStore } from '../../store/useSearchStore';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/useChatStore';
import { workspaceApi } from '../../api/workspaceApi';
import { notify } from '../../store/useUIStore';
import { useSettingsStore } from '../../store/useSettingsStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RichPaper {
  id: string;
  title: string;
  abstract: string;
  authors: string;           
  authors_list: string[];    
  date: string;              
  published_date: string;
  source: string;
  url: string;
  pdf_url: string | null;
  arxiv_id: string | null;
  openalex_work_id: string | null;
  citations: number;
  influential_score: number;
  keywords: string[];
  topic_tags: string[];
  inferred_topic_tags: string[];
  venue: string | null;
  semantic_score: number;
  topic_relevance_score: number;
  hybrid_relevance_score: number;
  ranking_reasons: Record<string, unknown>;
}

interface AnalyticsSummary {
  total_papers: number;
  papers_last_30_days: number;
  avg_citations: number;
  max_citations: number;
  trend_status: string;
  top_keywords: [string, number][];
  top_authors: [string, number][];
  source_distribution: Record<string, number>;
  year_distribution: Record<string, number>;
  subtopic_distribution: Record<string, number>;
  field_distribution: Record<string, number>;
  venue_distribution: Record<string, number>;
  year_subtopic_trends: Record<string, Record<string, number>>;
  top_author_impact: { author: string; paper_count: number; citations: number; impact_score: number }[];
  top_cited_papers: { title: string; citations: number; url: string; year: string; authors: string[]; source: string; venue: string; subtopics: string[] }[];
  llm_insight: string;
}

interface ResultAccounting {
  retrieved_count?: number;
  deduplicated_count?: number;
  filtered_count?: number;
  final_ranked_count?: number;
  pipeline?: {
    raw_pool_count?: number;
    after_dedup_count?: number;
    after_filter_count?: number;
  };
}

interface SearchResponse {
  query: string;
  expanded_queries: string[];
  semantic_keywords: string[];
  total_found: number;
  source_counts: Record<string, number>;
  result_accounting: ResultAccounting;
  ranked_papers: RichPaper[];
  papers: RichPaper[];         
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
  analytics: AnalyticsSummary;
}

interface FilterState {
  viewFilter: 'all' | 'top20' | 'top50' | 'top100' | 'high_relevance';
  sortMode: 'relevance' | 'citations' | 'newest' | 'oldest';
  sourceFilter: 'all' | 'arxiv' | 'openalex' | 'local_landmark';
  yearMin: number;
  yearMax: number;
  minCitations: number;
  authorQuery: string;
  minRelevance: number;
}

const DEFAULT_FILTERS: FilterState = {
  viewFilter: 'all',
  sortMode: 'relevance',
  sourceFilter: 'all',
  yearMin: 1950,
  yearMax: new Date().getFullYear(),
  minCitations: 0,
  authorQuery: '',
  minRelevance: 0.35,
};

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50] as const;

// ─── Client-side filter + sort logic ─────────────────────────────────────────

function paperYear(p: RichPaper): number | null {
  const d = p.published_date || p.date || '';
  if (d.length >= 4 && /^\d{4}/.test(d)) return parseInt(d.slice(0, 4));
  return null;
}

function compositeScore(p: RichPaper): number {
  const rr = p.ranking_reasons as Record<string, number>;
  if (rr?.composite !== undefined) return Number(rr.composite);
  return Math.max(
    p.semantic_score || 0,
    p.topic_relevance_score || 0,
    p.hybrid_relevance_score || 0,
  );
}

function paperSources(p: RichPaper): string[] {
  return (p.source || '').split(',').map(s => s.trim()).filter(Boolean);
}

function applyFiltersAndSort(papers: RichPaper[], f: FilterState, thisYear: number): RichPaper[] {
  let base = [...papers];

  if (f.viewFilter === 'top20') base = base.slice(0, 20);
  else if (f.viewFilter === 'top50') base = base.slice(0, 50);
  else if (f.viewFilter === 'top100') base = base.slice(0, 100);
  else if (f.viewFilter === 'high_relevance') {
    base = base.filter(p => compositeScore(p) >= f.minRelevance);
  }

  if (f.sourceFilter !== 'all') {
    base = base.filter(p => paperSources(p).includes(f.sourceFilter));
  }

  if (f.yearMin > 1950) base = base.filter(p => (paperYear(p) ?? 0) >= f.yearMin);
  if (f.yearMax < thisYear) base = base.filter(p => (paperYear(p) ?? 9999) <= f.yearMax);

  if (f.minCitations > 0) base = base.filter(p => (p.citations || 0) >= f.minCitations);

  if (f.authorQuery.trim()) {
    const aq = f.authorQuery.trim().toLowerCase();
    base = base.filter(p => (p.authors_list || []).some(a => (a || '').toLowerCase().includes(aq)));
  }

  if (f.sortMode === 'citations') {
    base.sort((a, b) => (b.citations || 0) - (a.citations || 0));
  } else if (f.sortMode === 'newest') {
    base.sort((a, b) => (b.published_date || b.date || '').localeCompare(a.published_date || a.date || ''));
  } else if (f.sortMode === 'oldest') {
    base.sort((a, b) => (a.published_date || a.date || '').localeCompare(b.published_date || b.date || ''));
  }

  return base;
}

function countActiveFilters(f: FilterState, thisYear: number): number {
  let n = 0;
  if (f.viewFilter !== 'all') n++;
  if (f.sortMode !== 'relevance') n++;
  if (f.sourceFilter !== 'all') n++;
  if (f.yearMin > 1950) n++;
  if (f.yearMax < thisYear) n++;
  if (f.minCitations > 0) n++;
  if (f.authorQuery.trim()) n++;
  return n;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const MAP: Record<string, { label: string; cls: string }> = {
    arxiv: { label: 'arXiv', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    openalex: { label: 'OpenAlex', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
    local_landmark: { label: 'Landmark', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  };
  const info = MAP[source.toLowerCase()] ?? { label: source, cls: 'bg-stone-100 text-stone-600 border-stone-200' };
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', info.cls)}>
      {info.label}
    </span>
  );
}

function RelevanceBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  const gradient =
    pct >= 70 ? 'from-emerald-500 to-emerald-400'
    : pct >= 40 ? 'from-sage-500 to-sage-400'
    : 'from-stone-400 to-stone-300';
  return (
    <div className="mt-3">
      <div className="flex justify-between mb-1.5">
        <span className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider">Semantic Relevance</span>
        <span className="text-[10px] font-bold text-stone-900">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
        <div className={clsx('h-full rounded-full bg-gradient-to-r', gradient)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Chip({ label, variant }: { label: string; variant: 'blue' | 'purple' | 'green' | 'gray' }) {
  const cls = {
    blue:   'bg-sage-50 text-sage-700 border-sage-200',
    purple: 'bg-violet-50 text-violet-700 border-violet-200',
    green:  'bg-teal-50 text-teal-700 border-teal-200',
    gray:   'bg-stone-100 text-stone-600 border-stone-200',
  }[variant];
  return (
    <span className={clsx('inline-block px-2 py-1 rounded-full text-[11px] font-semibold border mr-1.5 mb-1.5', cls)}>
      {label}
    </span>
  );
}

// ─── Insights Panel ───────────────────────────────────────────────────────────

function InsightsPanel({ analytics, query }: { analytics: AnalyticsSummary; query: string }) {
  const isTrendRising = analytics.trend_status?.includes('Rising') || analytics.trend_status?.includes('📈');
  const isTrendDown   = analytics.trend_status?.includes('Declining') || analytics.trend_status?.includes('📉');
  const trendColor    = isTrendRising ? 'text-emerald-600' : isTrendDown ? 'text-red-500' : 'text-stone-500';

  // Bar chart helper (CSS only)
  const maxKw = analytics.top_keywords?.[0]?.[1] ?? 1;
  const maxAuthor = analytics.top_author_impact?.[0]?.impact_score ?? 1;

  const sourceColors: Record<string, string> = {
    arxiv:          'bg-emerald-500',
    openalex:       'bg-violet-500',
    local_landmark: 'bg-amber-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* ── Stat cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <BookOpen className="h-4 w-4 text-sage-600" />, label: 'Total Papers', value: analytics.total_papers?.toLocaleString() ?? '—' },
          { icon: <Calendar className="h-4 w-4 text-violet-500" />, label: 'Last 30 Days', value: analytics.papers_last_30_days ?? '—' },
          { icon: <TrendingUp className={clsx('h-4 w-4', trendColor)} />, label: 'Trend', value: analytics.trend_status ?? '—', small: true },
          { icon: <Award className="h-4 w-4 text-amber-500" />, label: 'Avg Citations', value: analytics.avg_citations?.toFixed(1) ?? '—' },
        ].map(({ icon, label, value, small }) => (
          <div key={label} className="bg-white rounded-2xl border border-stone-200 shadow-soft p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">
              {icon}{label}
            </div>
            <div className={clsx('font-extrabold text-stone-900', small ? 'text-sm mt-1' : 'text-2xl')}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── LLM Insight ─────────────────────────────────────────────── */}
      {analytics.llm_insight && (
        <div className="relative bg-gradient-to-br from-sage-50 to-white border border-sage-200 rounded-2xl p-5 overflow-hidden shadow-soft">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-sage-500 to-sage-200" />
          <div className="flex items-center gap-2 mb-2 pl-3">
            <Flame className="h-4 w-4 text-sage-600" />
            <span className="text-[10px] font-extrabold text-sage-600 uppercase tracking-widest">
              AI Research Landscape · {query}
            </span>
          </div>
          <p className="pl-3 text-sm text-stone-700 leading-relaxed">{analytics.llm_insight}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Top Keywords ──────────────────────────────────────────── */}
        {analytics.top_keywords?.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="h-4 w-4 text-violet-500" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Top Research Keywords</h3>
            </div>
            <div className="space-y-2">
              {analytics.top_keywords.slice(0, 8).map(([kw, count]) => (
                <div key={kw} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-stone-700 w-36 truncate shrink-0">{kw}</span>
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-400 to-violet-600 rounded-full"
                      style={{ width: `${Math.round((count / maxKw) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-stone-500 w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Top Cited Papers ──────────────────────────────────────── */}
        {analytics.top_cited_papers?.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            <div className="flex items-center gap-2 mb-4">
              <Award className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Most Cited Papers</h3>
            </div>
            <div className="space-y-3">
              {analytics.top_cited_papers.slice(0, 5).map((p, i) => {
                const medals = ['🥇','🥈','🥉','4','5'];
                return (
                  <div key={i} className="flex items-start gap-3 group">
                    <span className="text-lg leading-none mt-0.5 shrink-0">{medals[i] ?? i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-stone-800 group-hover:text-sage-700 line-clamp-2 transition-colors"
                      >
                        {p.title}
                      </a>
                      <div className="text-[11px] text-stone-400 mt-0.5">
                        {p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''} · {p.year}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      {p.citations.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Author Impact ─────────────────────────────────────────── */}
        {analytics.top_author_impact?.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-sage-600" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Author Impact</h3>
            </div>
            <div className="space-y-2">
              {analytics.top_author_impact.slice(0, 7).map((a) => (
                <div key={a.author} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-stone-700 w-36 truncate shrink-0">{a.author}</span>
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sage-400 to-sage-600 rounded-full"
                      style={{ width: `${Math.round((a.impact_score / maxAuthor) * 100)}%` }}
                    />
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-bold text-stone-600">{a.paper_count}p</span>
                    <span className="text-[10px] text-stone-400 ml-1">{a.citations.toLocaleString()}c</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Source Distribution ───────────────────────────────────── */}
        {analytics.source_distribution && Object.keys(analytics.source_distribution).length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-4 w-4 text-stone-500" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Source Breakdown</h3>
            </div>
            <div className="space-y-3">
              {Object.entries(analytics.source_distribution).map(([src, count]) => {
                const total = Object.values(analytics.source_distribution).reduce((a, b) => a + b, 0);
                const pct = Math.round((count / total) * 100);
                const colorClass = sourceColors[src] ?? 'bg-stone-400';
                const label = src === 'arxiv' ? 'arXiv' : src === 'openalex' ? 'OpenAlex' : src === 'local_landmark' ? 'Landmark' : src;
                return (
                  <div key={src}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-semibold text-stone-700">{label}</span>
                      <span className="text-stone-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div className={clsx('h-full rounded-full', colorClass)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Field Distribution ────────────────────────────────────── */}
        {analytics.field_distribution && Object.keys(analytics.field_distribution).length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart className="h-4 w-4 text-violet-500" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Research Fields</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(analytics.field_distribution).slice(0, 8).map(([field, count]) => {
                const maxField = Math.max(...Object.values(analytics.field_distribution));
                return (
                  <div key={field} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-stone-700 w-36 truncate shrink-0">{field}</span>
                    <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-300 to-violet-500 rounded-full"
                        style={{ width: `${Math.round((count / maxField) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-stone-500 w-6 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Year Distribution ─────────────────────────────────────── */}
        {analytics.year_distribution && Object.keys(analytics.year_distribution).length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Publications by Year</h3>
            </div>
            <div className="flex items-end gap-1.5 h-24">
              {Object.entries(analytics.year_distribution).slice(-10).map(([year, count]) => {
                const maxY = Math.max(...Object.values(analytics.year_distribution));
                const pct = Math.round((count / maxY) * 100);
                return (
                  <div key={year} className="flex-1 flex flex-col items-center gap-1 group">
                    <div
                      className="w-full bg-gradient-to-t from-amber-400 to-amber-200 rounded-t-sm transition-all group-hover:from-amber-500"
                      style={{ height: `${pct}%`, minHeight: 4 }}
                      title={`${year}: ${count}`}
                    />
                    <span className="text-[9px] text-stone-400 rotate-45 origin-bottom-left mt-1 hidden sm:block">{year.slice(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  onChange,
  onReset,
  thisYear,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  thisYear: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scaleY: 0.96 }}
      animate={{ opacity: 1, y: 0, scaleY: 1 }}
      exit={{ opacity: 0, y: -8, scaleY: 0.96 }}
      transition={{ duration: 0.18 }}
      className="origin-top mt-2 p-5 rounded-2xl bg-white border border-stone-200 shadow-panel"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Focus</span>
          <select
            value={filters.viewFilter}
            onChange={e => onChange({ viewFilter: e.target.value as FilterState['viewFilter'] })}
            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-sage-500/50"
          >
            <option value="all">All ranked</option>
            <option value="top20">Top 20</option>
            <option value="top50">Top 50</option>
            <option value="top100">Top 100</option>
            <option value="high_relevance">High relevance</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Sort by</span>
          <select
            value={filters.sortMode}
            onChange={e => onChange({ sortMode: e.target.value as FilterState['sortMode'] })}
            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-sage-500/50"
          >
            <option value="relevance">Relevance (AI ranked)</option>
            <option value="citations">Most cited</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Source</span>
          <select
            value={filters.sourceFilter}
            onChange={e => onChange({ sourceFilter: e.target.value as FilterState['sourceFilter'] })}
            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-sage-500/50"
          >
            <option value="all">All sources</option>
            <option value="arxiv">arXiv only</option>
            <option value="openalex">OpenAlex only</option>
            <option value="local_landmark">Landmark only</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Year from</span>
          <input
            type="number"
            min={1950}
            max={thisYear}
            value={filters.yearMin}
            onChange={e => onChange({ yearMin: parseInt(e.target.value) || 1950 })}
            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-sage-500/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Year to</span>
          <input
            type="number"
            min={1950}
            max={thisYear}
            value={filters.yearMax}
            onChange={e => onChange({ yearMax: parseInt(e.target.value) || thisYear })}
            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-sage-500/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Min citations</span>
          <input
            type="number"
            min={0}
            step={10}
            value={filters.minCitations}
            onChange={e => onChange({ minCitations: parseInt(e.target.value) || 0 })}
            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-sage-500/50"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Author contains</span>
          <input
            type="text"
            value={filters.authorQuery}
            onChange={e => onChange({ authorQuery: e.target.value })}
            placeholder='e.g. "Vaswani" or "Hinton"'
            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sage-500/50"
          />
        </label>
        {filters.viewFilter === 'high_relevance' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
              Min relevance score ({Math.round(filters.minRelevance * 100)}%)
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={filters.minRelevance}
              onChange={e => onChange({ minRelevance: parseFloat(e.target.value) })}
              className="mt-2 accent-sage-600"
            />
          </label>
        )}
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-stone-100">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 transition-colors"
        >
          <X className="h-4 w-4" />
          Reset filters
        </button>
      </div>
    </motion.div>
  );
}

// ─── Paper Card ───────────────────────────────────────────────────────────────

function PaperCard({
  paper,
  isSelected,
  onClick,
}: {
  paper: RichPaper;
  isSelected: boolean;
  onClick: () => void;
}) {
  const sources = paperSources(paper);
  const topicPct = Math.round((paper.topic_relevance_score || 0) * 100);
  const authorsStr = (() => {
    const list = paper.authors_list || [];
    if (list.length === 0) return paper.authors || 'Unknown';
    const shown = list.slice(0, 3).join(', ');
    return list.length > 3 ? `${shown} +${list.length - 3} more` : shown;
  })();
  const snippet = (paper.abstract || '').length > 450
    ? paper.abstract.slice(0, 450) + '…'
    : (paper.abstract || '');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={clsx(
        'group relative rounded-2xl border p-6 cursor-pointer transition-all duration-200',
        'bg-white shadow-soft',
        isSelected
          ? 'border-sage-400 ring-2 ring-sage-400/20 shadow-card'
          : 'border-stone-200 hover:border-stone-300 hover:shadow-card hover:-translate-y-0.5',
      )}
    >
      <div className="flex flex-wrap items-start gap-2 mb-3">
        <div className="flex gap-1.5 flex-wrap">
          {sources.map(src => <SourceBadge key={src} source={src} />)}
        </div>
        {paper.citations > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-stone-500 font-semibold bg-stone-50 px-2 py-0.5 rounded-full border border-stone-100">
            <TrendingUp className="h-3 w-3 text-sage-600" />
            {paper.citations.toLocaleString()} citations
          </span>
        )}
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-50 text-stone-600 hover:bg-stone-100 hover:text-stone-900 text-[11px] font-bold border border-stone-200 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" /> PDF
          </a>
        )}
      </div>

      <h2 className="text-lg font-bold text-stone-900 leading-snug mb-2 pr-6 group-hover:text-sage-700 transition-colors">
        {paper.title}
      </h2>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-500 mb-3 font-medium">
        <span className="text-sage-600">{authorsStr}</span>
        {(paper.published_date || paper.date) && (
          <>
            <span className="text-stone-300">•</span>
            <span>{(paper.published_date || paper.date).slice(0, 10)}</span>
          </>
        )}
        {paper.venue && (
          <>
            <span className="text-stone-300">•</span>
            <span className="italic">{paper.venue}</span>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 text-xs text-stone-500 mb-3 bg-stone-50 px-3 py-1.5 rounded-lg inline-flex">
        <span>Topic: <b className="text-stone-700">{topicPct}%</b></span>
        {paper.hybrid_relevance_score > 0 && (
          <span>Hybrid: <b className="text-stone-700">{Math.round(paper.hybrid_relevance_score * 100)}%</b></span>
        )}
      </div>

      {(paper.topic_tags?.length > 0 || paper.inferred_topic_tags?.length > 0) && (
        <div className="flex flex-wrap items-center gap-0.5 mb-3">
          <Tag className="h-3.5 w-3.5 text-sage-500 mx-1 shrink-0" />
          {(paper.topic_tags || []).slice(0, 5).map(t => (
            <Chip key={t} label={t} variant="green" />
          ))}
          {(paper.inferred_topic_tags || []).slice(0, 3).map(t => (
            <Chip key={t} label={t} variant="gray" />
          ))}
        </div>
      )}

      {snippet && (
        <p className="text-sm text-stone-600 leading-relaxed border-l-2 border-sage-200 pl-4 py-1 italic">
          {snippet}
        </p>
      )}

      <RelevanceBar score={paper.semantic_score} />
    </motion.div>
  );
}

// ─── Paper Detail Modal ───────────────────────────────────────────────────────

interface PaperDetailModalProps {
  paper: RichPaper;
  pdfFileName: string | null;
  pdfUrl: string | null;
  pdfSize: string | null;
  isImporting: boolean;
  importError: string | null;
  onClose: () => void;
  onSendMessage: (message: string) => Promise<{ response: string; sources?: any[] }>;
  availableFilesToCompare?: { id: string; name: string; sessionId: string; url?: string }[];
}

function PaperDetailModal({
  paper,
  pdfFileName,
  pdfUrl,
  pdfSize,
  isImporting,
  importError,
  onClose,
  onSendMessage,
  availableFilesToCompare,
}: PaperDetailModalProps) {
  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const sources = paperSources(paper);
  const authorsStr = (() => {
    const list = paper.authors_list || [];
    if (list.length === 0) return paper.authors || 'Unknown';
    return list.join(', ');
  })();

  return (
    <motion.div
      key="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative w-[92vw] max-w-7xl h-[88vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left Column: Paper Info ──────────────────────────────── */}
        <div className="lg:w-[38%] border-b lg:border-b-0 lg:border-r border-stone-200 bg-stone-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 pb-4 shrink-0">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex flex-wrap gap-1.5">
                {sources.map(src => <SourceBadge key={src} source={src} />)}
                {paper.citations > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-stone-500 font-semibold bg-white px-2 py-0.5 rounded-full border border-stone-200">
                    <TrendingUp className="h-3 w-3 text-sage-600" />
                    {paper.citations.toLocaleString()} citations
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <h2 className="text-xl font-bold text-stone-900 leading-snug mb-3">
              {paper.title}
            </h2>
            <p className="text-sm text-sage-600 font-medium mb-1">{authorsStr}</p>
            <div className="flex flex-wrap gap-x-3 text-xs text-stone-500 font-medium">
              {(paper.published_date || paper.date) && (
                <span>{(paper.published_date || paper.date).slice(0, 10)}</span>
              )}
              {paper.venue && (
                <>
                  <span className="text-stone-300">•</span>
                  <span className="italic">{paper.venue}</span>
                </>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 space-y-4">
            {/* Status badge */}
            {isImporting ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-semibold animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Downloading & indexing PDF…
              </div>
            ) : importError ? (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span className="font-normal leading-snug">{importError}</span>
              </div>
            ) : pdfFileName ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold">
                ✅ Full PDF indexed · tables, equations & figures available
              </div>
            ) : null}

            {/* Relevance */}
            <RelevanceBar score={paper.semantic_score} />

            {/* Scores */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Topic</p>
                <p className="text-lg font-extrabold text-stone-900">{Math.round((paper.topic_relevance_score || 0) * 100)}%</p>
              </div>
              <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Hybrid</p>
                <p className="text-lg font-extrabold text-stone-900">{Math.round((paper.hybrid_relevance_score || 0) * 100)}%</p>
              </div>
            </div>

            {/* Tags */}
            {(paper.topic_tags?.length > 0 || paper.inferred_topic_tags?.length > 0) && (
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Topics</p>
                <div className="flex flex-wrap">
                  {(paper.topic_tags || []).slice(0, 6).map(t => <Chip key={t} label={t} variant="green" />)}
                  {(paper.inferred_topic_tags || []).slice(0, 4).map(t => <Chip key={t} label={t} variant="gray" />)}
                </div>
              </div>
            )}

            {/* Abstract */}
            {paper.abstract && (
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Abstract</p>
                <p className="text-sm text-stone-600 leading-relaxed">{paper.abstract}</p>
              </div>
            )}

            {/* Links */}
            <div className="flex gap-2 pt-2">
              {paper.url && (
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-700 transition-colors shadow-sm"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Paper
                </a>
              )}
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  download
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-stone-700 text-xs font-semibold border border-stone-200 hover:bg-stone-50 transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5" /> Download PDF
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column: Interaction Panel ─────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <PaperInteractionPanel
            title={paper.title}
            subtitle={`${paper.authors} · ${(paper.published_date || paper.date || '').slice(0, 10)}`}
            fileName={pdfFileName}
            pdfUrl={pdfUrl}
            pdfSize={pdfSize}
            isImporting={isImporting}
            alwaysShowCompare={true}
            availableFilesToCompare={availableFilesToCompare}
            initialMessage={
              isImporting ? (
                <div className="flex items-center gap-3 bg-amber-50 p-4 rounded-xl border border-amber-200">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-600 shrink-0" />
                  <span className="text-amber-800 font-semibold text-sm">Downloading and indexing PDF — extraction will be ready shortly…</span>
                </div>
              ) : importError ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-red-50 p-4 rounded-xl border border-red-200">
                    <span className="text-xl shrink-0">⚠️</span>
                    <div>
                      <p className="text-red-800 font-bold text-sm mb-1">PDF indexing failed</p>
                      <p className="text-red-700 text-xs leading-relaxed">{importError}</p>
                    </div>
                  </div>
                  <p className="text-sm text-stone-500">
                    I can still answer general questions about{" "}
                    <strong className="text-stone-700">{paper.title}</strong>{" "}
                    based on the abstract and metadata.
                  </p>
                </div>
              ) : pdfFileName ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 text-xs font-semibold">
                    <span>✅ Full PDF indexed</span>
                    <span className="text-emerald-500">·</span>
                    <span className="font-normal">tables, equations & figures available</span>
                  </div>
                  <p className="text-sm text-stone-700">I've analysed <strong>{paper.title}</strong>. Ask me to extract a table, explain an equation, or summarise any section.</p>
                </div>
              ) : (
                <>I've analysed <strong className="text-stone-900 font-bold">{paper.title}</strong>. Ask me anything about the methodology, results, or figures.</>
              )
            }
            onSendMessage={onSendMessage}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PaperSearch() {
  const thisYear = new Date().getFullYear();

  // ── Auth + refresh ────────────────────────────────────────────────────────
  const { token } = useAuthStore();
  const { triggerRefresh } = useChatStore();

  // ── Search history store (local cache for instant nav) ────────────────────
  const { activeQuery, activeResults, saveResults, newSearch } = useSearchStore();

  const [inputValue, setInputValue] = useState(activeQuery || '');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(activeResults ?? null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const [perPage, setPerPage] = useState<10 | 20 | 50>(10);
  const [uiPage, setUiPage] = useState(1);

  const [selectedPaper, setSelectedPaper] = useState<RichPaper | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfSize, setPdfSize] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [resultsTab, setResultsTab] = useState<'papers' | 'insights'>('papers');

  // Stable UUID-based session ID for PDF import/chat — generated once per component mount
  const paperSessionId = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync local state when the store's active session changes (e.g. history click)
  useEffect(() => {
    setResults(activeResults ?? null);
    setInputValue(activeQuery || '');
    setUiPage(1);
    setSelectedPaper(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeQuery, activeResults]);

  const fetchPapers = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setIsLoading(true);
    setResults(null);
    setUiPage(1);
    try {
      const response = await fetch(`${API_URL}/api/papers/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), page: 1, per_page: 100 }),
      });
      const data: SearchResponse = await response.json();
      setResults(data);
      // 1. Cache locally for instant history navigation
      saveResults(query.trim(), data);
      // 2. Persist to backend database
      if (token) {
        workspaceApi.saveSearch(
          token,
          query.trim(),
          data.total_found ?? data.total ?? data.ranked_papers?.length,
        ).catch(err => console.warn('Search save failed:', err));
        // 3. Refresh sidebar + workspace summary
        triggerRefresh();
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [saveResults, token, triggerRefresh]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    setFilters(DEFAULT_FILTERS);
    fetchPapers(inputValue.trim());
  };

  const patchFilter = (patch: Partial<FilterState>) => {
    setFilters(f => ({ ...f, ...patch }));
    setUiPage(1);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setUiPage(1);
  };

  const activeFilterCount = countActiveFilters(filters, thisYear);

  const rankedFull: RichPaper[] = results?.ranked_papers ?? [];
  const viewList = results ? applyFiltersAndSort(rankedFull, filters, thisYear) : [];
  const maxPage = Math.max(1, Math.ceil(viewList.length / perPage));
  const safeUiPage = Math.min(uiPage, maxPage);
  const pageStart = (safeUiPage - 1) * perPage;
  const pagePapers = viewList.slice(pageStart, pageStart + perPage);

  const handlePaperSelect = async (paper: RichPaper) => {
    if (selectedPaper?.id === paper.id) {
      setSelectedPaper(null);
      setPdfFileName(null);
      setPdfUrl(null);
      setPdfSize(null);
      setImportError(null);
      return;
    }
    setSelectedPaper(paper);
    setPdfFileName(null);
    setPdfUrl(null);
    setPdfSize(null);
    setImportError(null);
    setIsImporting(true);
    try {
      const paperId = paper.arxiv_id || paper.id;
      const importHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) importHeaders['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/pdf/import`, {
        method: 'POST',
        headers: importHeaders,
        body: JSON.stringify({ paper_id: paperId, session_id: paperSessionId.current, title: paper.title, pdf_url: paper.pdf_url || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        const reason = data?.detail || data?.message || `Server returned ${res.status}`;
        setImportError(`Could not index this paper: ${reason}`);
        notify('PDF Import Failed', `Could not index "${paper.title}": ${reason}`, 'error');
      } else if (data.filename) {
        setPdfFileName(data.filename);
        if (data.pdf_url)  setPdfUrl(data.pdf_url);
        if (data.pdf_size) setPdfSize(data.pdf_size);
        notify('PDF Indexed', `"${paper.title}" is ready — you can now chat, summarise, and explore the knowledge graph.`, 'success');
        triggerRefresh();
      } else {
        setImportError('PDF was downloaded but could not be indexed. The file may be corrupted or protected.');
        notify('PDF Import Failed', `"${paper.title}" was downloaded but could not be indexed.`, 'error');
      }
    } catch (err) {
      console.error('Import error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(`Network error — could not reach the server. ${msg}`);
      notify('PDF Import Failed', `Network error while importing "${paper.title}": ${msg}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const hasSearched = activeQuery !== '';
  const acct = results?.result_accounting ?? {};
  const pipe = (acct as any)?.pipeline ?? {};
  const funnelRetrieved = acct?.retrieved_count ?? pipe?.raw_pool_count ?? '—';
  const funnelDedup     = acct?.deduplicated_count ?? pipe?.after_dedup_count ?? '—';
  const funnelFiltered  = acct?.filtered_count ?? pipe?.after_filter_count ?? '—';
  const funnelRanked    = acct?.final_ranked_count ?? rankedFull.length;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-stone-50" style={{ fontFamily: "'Outfit', 'Inter', sans-serif" }}>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
        <div className="mx-auto max-w-4xl px-4 py-8">

          <div className={clsx(
            'flex flex-col mb-10 transition-all duration-500',
            !hasSearched ? 'items-center text-center mt-12' : 'items-start text-left',
          )}>
            {!hasSearched && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-3xl bg-sage-100 border border-sage-200 shadow-sm mb-6"
              >
                <Sparkles className="h-8 w-8 text-sage-600" />
              </motion.div>
            )}

            <h1 className={clsx(
              'font-extrabold text-stone-900 transition-all duration-300 tracking-tight',
              !hasSearched ? 'text-5xl mb-4' : 'text-3xl mb-4',
            )}>
              Hybrid AI Paper Search
            </h1>

            {!hasSearched && (
              <p className="text-stone-500 mb-10 max-w-xl text-lg leading-relaxed">
                Multi-source academic search with LLM query expansion, composite ranking, and smart deduplication.
              </p>
            )}

            <form
              onSubmit={handleSearchSubmit}
              className={clsx(
                'relative flex items-center w-full rounded-2xl transition-all duration-300',
                hasSearched
                  ? 'bg-white border-stone-200 shadow-sm'
                  : 'bg-white border-stone-200 shadow-card ring-4 ring-stone-100',
              )}
            >
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
              <input
                className="w-full h-16 bg-transparent pl-14 pr-16 text-lg text-stone-900 placeholder:text-stone-400 focus:outline-none"
                placeholder="e.g. diffusion models, transformers, GNN…"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-12 w-12 rounded-xl bg-sage-600 hover:bg-sage-700 text-white flex items-center justify-center disabled:opacity-40 transition-all shadow-md"
              >
                {isLoading && !hasSearched
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <Send className="h-5 w-5 ml-0.5" />}
              </button>
            </form>

            {!hasSearched && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
                <span className="text-sm font-semibold text-stone-400 mr-2">Try:</span>
                {['RAG', 'Transformers', 'GAN', 'BERT', 'diffusion models'].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInputValue(q); }}
                    className="px-4 py-2 rounded-full border border-stone-200 bg-white text-stone-600 text-sm font-semibold hover:border-sage-300 hover:bg-sage-50 hover:text-sage-700 transition-colors shadow-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-sage-600" />
              <p className="text-stone-500 font-medium text-lg">Expanding query & ranking sources…</p>
            </div>
          )}

          {!isLoading && results && (
            <>
              {(results.expanded_queries?.length > 0 || results.semantic_keywords?.length > 0) && (
                <div className="mb-6 p-5 rounded-2xl bg-white border border-stone-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-sage-400"></div>
                  <div className="text-[10px] font-extrabold text-sage-600 uppercase tracking-widest mb-3">
                    AI Query Expansion
                  </div>
                  {results.expanded_queries?.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-3">Variants</span>
                      {results.expanded_queries.map(q => <Chip key={q} label={q} variant="blue" />)}
                    </div>
                  )}
                  {results.semantic_keywords?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-3">Keywords</span>
                      {results.semantic_keywords.map(k => <Chip key={k} label={k} variant="purple" />)}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap mb-6 text-sm text-stone-500">
                {[
                  { label: 'Retrieved', val: funnelRetrieved },
                  { label: 'Deduped', val: funnelDedup },
                  { label: 'Filtered', val: funnelFiltered },
                  { label: 'Ranked', val: funnelRanked },
                ].map((item, i, arr) => (
                  <React.Fragment key={item.label}>
                    <div className="text-center bg-white px-4 py-2 rounded-xl border border-stone-200 shadow-sm min-w-24">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-stone-400">{item.label}</div>
                      <div className="font-extrabold text-stone-800 text-lg">{item.val}</div>
                    </div>
                    {i < arr.length - 1 && <ChevronRight className="h-5 w-5 text-stone-300" />}
                  </React.Fragment>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  { label: 'Full pool', val: rankedFull.length },
                  { label: 'This view', val: viewList.length },
                  ...(Object.entries(results.source_counts || {}).map(([k, v]) => ({ label: k, val: v }))),
                ].map(pill => (
                  <div key={pill.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 border border-stone-200 text-xs text-stone-600 font-medium">
                    {pill.label} <span className="font-bold text-stone-900 bg-white px-1.5 rounded text-[10px] shadow-sm">{pill.val}</span>
                  </div>
                ))}
              </div>

              {/* ── Tab Switcher ───────────────────────────────────────── */}
              <div className="flex items-center gap-1 mb-6 p-1 bg-stone-100 rounded-xl border border-stone-200 self-start">
                {(['papers', 'insights'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setResultsTab(tab)}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all',
                      resultsTab === tab
                        ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                        : 'text-stone-500 hover:text-stone-700',
                    )}
                  >
                    {tab === 'papers'
                      ? <><BookOpen className="h-3.5 w-3.5" />Results <span className="ml-1 text-[10px] bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded-full font-black">{viewList.length}</span></>
                      : <><BarChart2 className="h-3.5 w-3.5" />Insights</>}
                  </button>
                ))}
              </div>

              {resultsTab === 'insights' && results.analytics ? (
                <InsightsPanel analytics={results.analytics} query={activeQuery} />
              ) : (
              <>

              <div className="relative mb-6">
                <button
                  onClick={() => setFilterOpen(o => !o)}
                  className={clsx(
                    'flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-bold transition-all shadow-sm',
                    filterOpen
                      ? 'bg-sage-600 border-sage-600 text-white shadow-md'
                      : activeFilterCount > 0
                        ? 'bg-white border-sage-300 text-sage-700 hover:border-sage-400'
                        : 'bg-white border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50',
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filter & Sort Results
                  {activeFilterCount > 0 && (
                    <span className={clsx(
                      'ml-2 px-2 py-0.5 rounded-full text-[10px] font-black',
                      filterOpen ? 'bg-white/20 text-white' : 'bg-sage-100 text-sage-700',
                    )}>
                      {activeFilterCount} Active
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {filterOpen && (
                    <FilterPanel
                      filters={filters}
                      onChange={patchFilter}
                      onReset={resetFilters}
                      thisYear={thisYear}
                    />
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between gap-3 mb-5 mt-2">
                <span className="text-sm font-semibold text-stone-500">
                  {viewList.length === 0
                    ? `No results match current filters`
                    : `Showing ${pageStart + 1}–${Math.min(pageStart + perPage, viewList.length)} of ${viewList.length} results`
                  }
                </span>
                <div className="flex gap-2">
                  <select
                    value={perPage}
                    onChange={e => {
                      setPerPage(Number(e.target.value) as 10 | 20 | 50);
                      setUiPage(1);
                    }}
                    className="bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-sage-500/30 cursor-pointer shadow-sm"
                  >
                    {ITEMS_PER_PAGE_OPTIONS.map(n => (
                      <option key={n} value={n}>{n} per page</option>
                    ))}
                  </select>
                </div>
              </div>

              <AnimatePresence mode="popLayout">
                <div className="flex flex-col gap-5">
                  {pagePapers.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-20 bg-white rounded-3xl border border-stone-200 shadow-sm"
                    >
                      <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Filter className="h-8 w-8 text-stone-400" />
                      </div>
                      <h3 className="font-bold text-stone-800 text-lg mb-1">No matches found</h3>
                      <p className="font-medium text-stone-500 mb-6">Try adjusting your filters to see more results.</p>
                      <button onClick={resetFilters} className="px-6 py-2 bg-stone-100 text-stone-700 font-bold rounded-xl hover:bg-stone-200 transition-colors">
                        Clear Filters
                      </button>
                    </motion.div>
                  ) : (
                    pagePapers.map(paper => (
                      <PaperCard
                        key={paper.id}
                        paper={paper}
                        isSelected={selectedPaper?.id === paper.id}
                        onClick={() => handlePaperSelect(paper)}
                      />
                    ))
                  )}
                </div>
              </AnimatePresence>

              {pagePapers.length > 0 && (
                <div className="flex items-center justify-between pt-8 mt-8 mb-16">
                  <button
                    onClick={() => setUiPage(p => Math.max(1, p - 1))}
                    disabled={safeUiPage <= 1}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 text-sm font-bold hover:bg-stone-50 hover:border-stone-300 disabled:opacity-40 shadow-sm transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <span className="text-sm text-stone-500 font-bold tracking-wide">
                    Page {safeUiPage} of {maxPage}
                  </span>
                  <button
                    onClick={() => setUiPage(p => Math.min(maxPage, p + 1))}
                    disabled={safeUiPage >= maxPage}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 text-sm font-bold hover:bg-stone-50 hover:border-stone-300 disabled:opacity-40 shadow-sm transition-all"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              <p className="text-center text-xs font-semibold text-stone-400 pb-8 tracking-wide uppercase">
                Powered by Hybrid Search · arXiv &amp; OpenAlex · Llama Models
              </p>
            </>
            )}
          </>
          )}
        </div>
      </div>

      {/* ── Paper Detail Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPaper && (
          <PaperDetailModal
            paper={selectedPaper}
            pdfFileName={pdfFileName}
            pdfUrl={pdfUrl}
            pdfSize={pdfSize}
            isImporting={isImporting}
            importError={importError}
            onClose={() => setSelectedPaper(null)}
            availableFilesToCompare={rankedFull.map(p => ({
              id: p.arxiv_id || p.id,
              name: p.title,
              sessionId: '',
              url: p.url
            }))}
            onSendMessage={async (message) => {
              const sid = paperSessionId.current;
              if (pdfFileName) {
                // PDF is fully indexed — route through chat agent for grounded, well-formatted answers
                const chatHeaders: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  };
                const userGroqKey = useSettingsStore.getState().groqApiKey;
                if (userGroqKey) chatHeaders['x-groq-api-key'] = userGroqKey;
                const resp = await fetch(`${API_URL}/api/pdf/chat`, {
                  method: 'POST',
                  headers: chatHeaders,
                  body: JSON.stringify({ query: message, session_id: sid }),
                });
                const data = await resp.json();
                if (!resp.ok) {
                  return { response: data.detail || 'PDF chat failed.' };
                }

                // Return structured data — AiMessageRenderer will render equations/tables
                // as premium blocks with page-number badges; answer text stays clean.
                return {
                  response:  data.answer || data.response ||
                    'No relevant content found in the document for this query. Try rephrasing your question.',
                  equations: (data.equations || []).length > 0 ? data.equations : undefined,
                  tables:    (data.tables    || []).length > 0 ? data.tables    : undefined,
                  sources:   data.sources,
                };
              }

              // PDF not yet indexed — refuse to answer from memory/general knowledge
              if (isImporting) {
                return {
                  response:
                    '⏳ **PDF is still being downloaded and indexed.** Please wait a moment, then ask your question again — I will answer only from the full document content to ensure accuracy.',
                };
              }
              return {
                response:
                  '⚠️ **The full PDF could not be indexed** (it may be behind a paywall or unavailable). ' +
                  'I can only answer from indexed document content to avoid inaccurate responses. ' +
                  'You can read the abstract in the left panel, or try opening the paper directly.',
              };
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
