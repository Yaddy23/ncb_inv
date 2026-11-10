import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from './api/axios';
import { clearCurrentToken } from './lib/offlineQueue';

// Components
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Books from './pages/Books';
import Scan from './pages/Scan';
import ImportExport from './pages/ImportExport';
import Profile from './pages/Profile';
import AdminPanel from './pages/AdminPanel';
import DeliveryReceipts from './pages/DeliveryReceipts';
import SalesInvoices from './pages/SalesInvoices';
import EvaluationForms from './pages/EvaluationForms';
import Reservations from './pages/Reservations';
import NavBar from './components/NavBar';
import PrivateRoute from './components/PrivateRoute';
import { ToastProvider } from './components/Toast';
import { OnlineProvider, OnlineBanner } from './context/OnlineContext';
import { ThemeProvider } from './context/ThemeContext';
import { useIsMobile } from './hooks/useMediaQuery';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close the mobile menu when leaving mobile
  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await api.get('/auth/me');
        setUser(response.data);
      } catch (error) {
        // Not authenticated or token expired - stay on login
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      setUser(null);
      clearCurrentToken();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-slate-950 dark:text-slate-100">Loading...</div>;
  }

  return (
    <ToastProvider>
      <OnlineProvider>
        <ThemeProvider>
          <Router>
          <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
            {/* Mobile Top Bar */}
          {user && isMobile && (
            <header className="fixed top-0 left-0 right-0 topbar-height pt-safe bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 shadow-sm z-40 flex items-center px-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300"
                aria-label="Open menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="ml-4 font-semibold text-gray-900 dark:text-slate-100">NCB Inventory</h1>
            </header>
          )}

          {/* Sidebar / Mobile Drawer */}
          {user && (
            <NavBar
              user={user}
              onLogout={logout}
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
              isMobile={isMobile}
              isOpen={mobileMenuOpen}
              onClose={() => setMobileMenuOpen(false)}
            />
          )}

          {/* Mobile Drawer Overlay */}
          {user && isMobile && mobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
          )}

          <main
            className={user
              ? isMobile
                ? 'topbar-offset'
                : sidebarCollapsed
                  ? 'ml-16'
                  : 'ml-64'
              : 'ml-0'
            }
            style={{ transition: 'margin-left 0.3s ease' }}
          >
            <OnlineBanner />
            <Routes>
              <Route
                path="/login"
                element={user ? <Navigate to="/" replace /> : <Login onLogin={login} />}
              />
              <Route
                path="/"
                element={
                  <PrivateRoute isAuthenticated={!!user}>
                    <Dashboard user={user} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/books"
                element={
                  <PrivateRoute isAuthenticated={!!user}>
                    <Books user={user} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/scan"
                element={
                  <PrivateRoute isAuthenticated={!!user}>
                    <Scan user={user} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/import-export"
                element={
                  <PrivateRoute isAuthenticated={!!user && user.role === 'Admin'}>
                    <ImportExport user={user} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <PrivateRoute isAuthenticated={!!user}>
                    <Profile user={user} onLogin={login} onLogout={logout} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <PrivateRoute isAuthenticated={!!user && user.role === 'Admin'}>
                    <AdminPanel user={user} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/delivery-receipts"
                element={
                  <PrivateRoute isAuthenticated={!!user}>
                    <DeliveryReceipts user={user} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/sales-invoices"
                element={
                  <PrivateRoute isAuthenticated={!!user}>
                    <SalesInvoices user={user} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/reservations"
                element={
                  <PrivateRoute isAuthenticated={!!user && user.role === 'Admin'}>
                    <Reservations user={user} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/evaluation-forms"
                element={
                  <PrivateRoute isAuthenticated={!!user}>
                    <EvaluationForms user={user} />
                  </PrivateRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
        </Router>
        </ThemeProvider>
      </OnlineProvider>
    </ToastProvider>
  );
}

export default App;
