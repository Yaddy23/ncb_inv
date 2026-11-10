import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { saveCurrentToken } from '../lib/offlineQueue';
import { useToast } from '../components/Toast';
import { LogIn, User, Lock, Shield, ArrowLeft } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [showMfa, setShowMfa] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaUserId, setMfaUserId] = useState('');
  const { toast } = useToast();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleMfaChange = (e) => {
    setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post('/auth/login', formData);
      const { accessToken, refreshToken, mfaRequired, userId, ...userData } = response.data;

      // If MFA is required, show MFA challenge screen
      if (mfaRequired && userId) {
        setMfaUserId(userId);
        setShowMfa(true);
        return;
      }

      // Mirror the access token into IndexedDB for the offline scan queue
      // drainer (the service worker can't read localStorage)
      saveCurrentToken(accessToken);

      onLogin(userData);
      toast.success('Welcome back!');
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!mfaToken || mfaToken.length !== 6) {
      toast.error('Please enter a 6-digit code');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/auth/mfa/challenge', {
        userId: mfaUserId,
        token: mfaToken
      });

      const { accessToken, refreshToken, ...userData } = response.data;

      // Mirror the access token into IndexedDB for the offline scan queue
      saveCurrentToken(accessToken);

      onLogin(userData);
      toast.success('Welcome back!');
      setShowMfa(false);
      setMfaToken('');
      setMfaUserId('');
    } catch (error) {
      const message = error.response?.data?.message || 'Invalid MFA token';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    setShowMfa(false);
    setMfaToken('');
    setMfaUserId('');
  };

  if (showMfa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6 p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goBackToLogin}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 flex-1 text-center">MFA Challenge</h2>
            <div className="w-10" />
          </div>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Multi-Factor Authentication</h3>
            <p className="mt-2 text-gray-600 dark:text-slate-400 text-sm">
              Enter the 6-digit code from your authenticator app to complete sign in.
            </p>
          </div>

          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                6-Digit Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={mfaToken}
                  onChange={handleMfaChange}
                  placeholder="000000"
                  maxLength={6}
                  required
                  className="w-full text-center text-2xl sm:text-3xl tracking-widest font-mono border-2 border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg py-3 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 focus:border-transparent touch-manipulation min-h-[56px]"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <p className="text-center text-sm text-gray-500 dark:text-slate-400 mt-1">
                The code changes every 30 seconds
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || mfaToken.length !== 6}
              className="w-full flex items-center justify-center px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-50 transition-colors touch-manipulation min-h-[48px] text-base font-medium"
            >
              {loading ? (
                <>
                  <span className="mr-2">Verifying...</span>
                  <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                </>
              ) : (
                <>
                  <Shield className="mr-2 w-4 h-4" />
                  <span>Verify & Sign In</span>
                </>
              )}
            </button>
          </form>

          <button
            onClick={goBackToLogin}
            className="w-full flex items-center justify-center px-4 py-3 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors text-sm font-medium"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6 p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-primary dark:text-blue-400" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100">Welcome Back</h2>
          <p className="mt-2 text-gray-600 dark:text-slate-400">Sign in to continue to Book Inventory System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-slate-600 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 focus:border-transparent touch-manipulation min-h-[48px] text-base"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-slate-600 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 focus:border-transparent touch-manipulation min-h-[48px] text-base"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-50 transition-colors touch-manipulation min-h-[48px] text-base font-medium"
          >
            {loading ? (
              <>
                <span className="mr-2">Signing in...</span>
                <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
              </>
            ) : (
              <>
                <LogIn className="mr-2 w-4 h-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center text-sm text-gray-500 dark:text-slate-400">
          Don't have an account? Contact administrator
        </div>
      </div>
    </div>
  );
};

export default Login;