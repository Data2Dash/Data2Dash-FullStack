import React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { CitationStyle } from '../../../api/citationApi';

const STYLES: { value: CitationStyle; label: string; desc: string }[] = [
  { value: 'apa', label: 'APA', desc: '7th Edition' },
  { value: 'mla', label: 'MLA', desc: '9th Edition' },
  { value: 'chicago', label: 'Chicago', desc: '17th Edition' },
  { value: 'ieee', label: 'IEEE', desc: 'Institute of Electrical' },
  { value: 'harvard', label: 'Harvard', desc: 'Author-Date' },
  { value: 'bibtex', label: 'BibTeX', desc: 'LaTeX format' },
];

interface StyleSelectorProps {
  active: CitationStyle;
  onChange: (style: CitationStyle) => void;
}

export function StyleSelector({ active, onChange }: StyleSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const current = STYLES.find((s) => s.value === active)!;

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-xl text-xs font-bold text-stone-700 transition-all"
      >
        <span className="text-sage-600">{current.label}</span>
        <span className="text-stone-400 font-normal hidden sm:inline">{current.desc}</span>
        <ChevronDown className={`h-3 w-3 text-stone-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-stone-200 rounded-2xl shadow-panel overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          <p className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-stone-400">
            Citation Style
          </p>
          {STYLES.map((s) => (
            <button
              key={s.value}
              onClick={() => { onChange(s.value); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-stone-50 transition-colors"
            >
              <div>
                <span className="text-sm font-bold text-stone-800">{s.label}</span>
                <span className="ml-2 text-[11px] text-stone-400">{s.desc}</span>
              </div>
              {active === s.value && <Check className="h-3.5 w-3.5 text-sage-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
