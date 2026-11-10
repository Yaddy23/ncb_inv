import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, LogOut, User, Plus, Barcode, ShoppingBag, Settings, X, FileText, Receipt, FilePlus, Bookmark, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const NAV_ITEMS = [
  { to: '/', label: 'Scan Books', icon: Barcode },
  { to: '/books', label: 'Book Catalog', icon: ShoppingBag },
  { to: '/import-export', label: 'Import/Export', icon: Plus, adminOnly: true },
  { to: '/evaluation-forms', label: 'Evaluation Forms', icon: FilePlus },
  { to: '/delivery-receipts', label: 'Delivery Receipts', icon: Receipt },
  { to: '/reservations', label: 'Reservations', icon: Bookmark, adminOnly: true },
  { to: '/sales-invoices', label: 'Sales Invoices', icon: FileText },
  { to: '/admin', label: 'Admin Panel', icon: Settings, adminOnly: true },
  { to: '/profile', label: 'Profile', icon: User },
];

const NavBar = ({ user, onLogout, collapsed, onToggle, isMobile, isOpen, onClose }) => {
  const location = useLocation();
  const prevLocationRef = useRef(location);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Mobile drawer exit animation: play slide-out/fade-out, then actually close.
  // EXIT_MS matches --motion-fast (duration of the slide-out/fade-out animations).
  const EXIT_MS = 150;
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef(null);

  // closingRef guards against double-close (rapid link click + close button).
  const requestClose = useCallback(() => {
    if (!isMobile || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      closingRef.current = false;
      setClosing(false);
      onClose?.();
    }, EXIT_MS);
  }, [isMobile, onClose]);

  // Close mobile menu on navigation (route change, e.g. browser back) — also
  // through the animated close
  useEffect(() => {
    if (isMobile && isOpen && location !== prevLocationRef.current) {
      requestClose();
    }
    prevLocationRef.current = location;
  }, [location, isMobile, isOpen, requestClose]);

  // Parent closed us directly (isOpen -> false): drop any pending close timer
  // and reset the closing state
  useEffect(() => {
    if (!isOpen) {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      closingRef.current = false;
      setClosing(false);
    }
  }, [isOpen]);

  // Clear any pending timer on unmount
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Don't render if mobile and not open
  if (isMobile && !isOpen) {
    return null;
  }

  const sidebarClasses = isMobile
    ? 'fixed left-0 top-[calc(4rem_+_env(safe-area-inset-top,0px))] h-[calc(100vh_-_4rem_-_env(safe-area-inset-top,0px))] w-64 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 border-r shadow-xl z-50 transform transition-transform duration-300 ease-in-out'
    : `fixed left-0 top-0 h-screen bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 border-r shadow-lg z-50 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`;

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'Admin');

  // Cycle: light -> dark -> follow OS -> light
  const cycleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  };

  const themeIcon = theme === 'system'
    ? <Monitor className="w-5 h-5" />
    : resolvedTheme === 'dark'
      ? <Sun className="w-5 h-5" />
      : <Moon className="w-5 h-5" />;

  const themeLabel = theme === 'system'
    ? 'System'
    : resolvedTheme === 'dark' ? 'Dark' : 'Light';

  return (
    <>
      {/* Mobile backdrop: fades in with the drawer, tap to close (animated) */}
      {isMobile && (
        <div
          className={`fixed inset-0 top-[calc(4rem_+_env(safe-area-inset-top,0px))] z-40 bg-black/50 ${
            closing ? 'animate-fade-out' : 'animate-fade-in'
          }`}
          onMouseDown={requestClose}
          aria-hidden="true"
        />
      )}
      <nav
        className={`${sidebarClasses}${
          isMobile ? ` ${closing ? 'animate-slide-out-left' : 'animate-slide-in-left'}` : ''
        }`}
      >
      <div className="flex flex-col h-full p-4">
        {/* Header - only show on desktop or when not collapsed */}
        {!isMobile && (
          <div className="flex items-center space-x-3 mb-6">
            <button
              onClick={onToggle}
              className="flex items-center space-x-3 w-full p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              title={collapsed ? 'Expand menu' : 'Collapse menu'}
            >
              <div className="w-10 h-10 bg-primary/10 dark:bg-blue-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <Menu className="w-5 h-5 text-primary dark:text-blue-400" />
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0 transition-opacity duration-200">
                  <h2 className="font-semibold text-primary dark:text-blue-400 truncate">NCB Inventory</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate">Management System</p>
                </div>
              )}
            </button>
            {!collapsed && (
              <button
                onClick={cycleTheme}
                className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={`Theme: ${themeLabel}. Click to change`}
                title={`Theme: ${themeLabel}`}
              >
                {themeIcon}
              </button>
            )}
          </div>
        )}

        {/* Mobile Header with Close Button */}
        {isMobile && (
          <div className="flex items-center justify-between mb-6">
            <div className="w-10 h-10 bg-primary/10 dark:bg-blue-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <Menu className="w-5 h-5 text-primary dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-primary dark:text-blue-400">NCB Inventory</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">Management System</p>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={cycleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={`Theme: ${themeLabel}. Click to change`}
                title={`Theme: ${themeLabel}`}
              >
                {themeIcon}
              </button>
              <button
                onClick={requestClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex items-center space-x-3 px-3 py-2 rounded-md text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 group"
                  onClick={isMobile ? requestClose : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isMobile && !collapsed && <span className="transition-opacity duration-200">{label}</span>}
                  {isMobile && <span className="ml-3">{label}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4 pb-2 border-t border-gray-200 dark:border-slate-800">
          <button
            onClick={onLogout}
            className="w-full flex items-center space-x-3 px-3 py-2 text-left text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-md group"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isMobile && !collapsed && <span className="transition-opacity duration-200">Logout</span>}
            {isMobile && <span className="ml-3">Logout</span>}
          </button>
        </div>
      </div>
      </nav>
    </>
  );
};

export default NavBar;
