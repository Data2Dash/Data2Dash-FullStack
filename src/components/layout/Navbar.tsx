import React, { useState, useEffect } from 'react';
import { Menu, X, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { clsx } from 'clsx';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (path: string) => location.pathname === path;
  
  // Navbar is transparent only on Home page when not scrolled
  const isTransparent = location.pathname === '/' && !isScrolled;

  const navLinks = [
    { name: 'Search', path: '/search' },
    { name: 'Upload', path: '/upload' },
    { name: 'Citation', path: '/citation' },
  ];

  return (
    <nav
      className={clsx(
        'fixed top-0 z-50 w-full transition-all duration-300',
        isTransparent 
          ? 'bg-transparent py-4' 
          : 'bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-200 py-2'
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-12 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl tracking-tight group">
            <div className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              isTransparent ? "bg-white/10 text-white backdrop-blur-sm group-hover:bg-white/20" : "bg-indigo-600 text-white"
            )}>
              <Sparkles className="h-5 w-5" />
            </div>
            <span className={clsx(
              "transition-colors",
              isTransparent ? 'text-white' : 'text-slate-900'
            )}>
              DATA<span className={isTransparent ? "text-indigo-300" : "text-indigo-600"}>2</span>DASH
            </span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={clsx(
                  'text-sm font-medium transition-colors',
                  isActive(item.path) 
                    ? 'text-indigo-500 font-semibold' 
                    : (isTransparent ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-indigo-600')
                )}
              >
                {item.name}
              </Link>
            ))}
            <Button 
              size="sm" 
              variant={isTransparent ? 'secondary' : 'primary'}
              className={clsx(
                "transition-all",
                isTransparent && "bg-white/10 text-white hover:bg-white/20 border border-white/20 backdrop-blur-sm"
              )}
            >
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-md hover:bg-black/5 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className={clsx('h-6 w-6', isTransparent ? 'text-white' : 'text-slate-900')} />
            ) : (
              <Menu className={clsx('h-6 w-6', isTransparent ? 'text-white' : 'text-slate-900')} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-white border-b border-slate-200 p-4 md:hidden shadow-lg animate-in slide-in-from-top-5 duration-200">
          <div className="flex flex-col space-y-4">
            {navLinks.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={clsx(
                  "text-left text-sm font-medium p-2 rounded-lg transition-colors",
                  isActive(item.path) 
                    ? "bg-indigo-50 text-indigo-600" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-indigo-600"
                )}
              >
                {item.name}
              </Link>
            ))}
            <Button className="w-full">Get Started</Button>
          </div>
        </div>
      )}
    </nav>
  );
}
