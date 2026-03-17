import React, { useState, useRef, useEffect } from 'react';
import { Menu, X, Sparkles, LogOut, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const { user, isAuthenticated, logout } = useAuthStore();

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { name: 'Chat', path: '/' },
    { name: 'Search', path: '/search' },
    { name: 'Upload', path: '/upload' },
    { name: 'Citation', path: '/citation' },
  ];

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <nav className="fixed top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-stone-100">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold text-stone-900 text-sm tracking-tight">
              DATA<span className="text-sage-600">2</span>DASH
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {isAuthenticated && navLinks.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive(item.path)
                    ? 'bg-stone-100 text-stone-900'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50'
                )}
              >
                {item.name}
              </Link>
            ))}

            {/* User menu / auth buttons */}
            {isAuthenticated ? (
              <div className="relative ml-2" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-stone-100 transition-colors group"
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.full_name ?? ''} className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-semibold">
                      {initials}
                    </div>
                  )}
                  <span className="text-sm font-medium text-stone-700 max-w-[120px] truncate">
                    {user?.full_name ?? user?.email}
                  </span>
                  <ChevronDown className={clsx('h-3.5 w-3.5 text-stone-400 transition-transform', isUserMenuOpen && 'rotate-180')} />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl border border-stone-200 shadow-panel py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-stone-100">
                      <p className="text-xs font-semibold text-stone-900 truncate">{user?.full_name ?? 'User'}</p>
                      <p className="text-xs text-stone-400 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-b-xl"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-2">
                <Link to="/login" className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-colors">
                  Sign in
                </Link>
                <Link to="/signup" className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 transition-colors shadow-soft">
                  Sign up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-stone-100 transition-colors text-stone-600"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-stone-100 bg-white px-4 py-3 space-y-1">
          {isAuthenticated && navLinks.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => setIsMobileMenuOpen(false)}
              className={clsx(
                'block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive(item.path)
                  ? 'bg-stone-100 text-stone-900'
                  : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
              )}
            >
              {item.name}
            </Link>
          ))}
          {isAuthenticated ? (
            <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          ) : (
            <div className="flex gap-2 pt-1">
              <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-medium text-stone-700 border border-stone-200">Sign in</Link>
              <Link to="/signup" onClick={() => setIsMobileMenuOpen(false)} className="flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-medium bg-stone-900 text-white">Sign up</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
