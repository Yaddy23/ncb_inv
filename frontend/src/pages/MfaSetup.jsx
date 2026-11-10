import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useToast } from '../components/Toast';
import { Shield, QrCode, Smartphone, ArrowLeft, CheckCircle, AlertTriangle, RefreshCw, Eye, EyeOff, Copy, Trash2, Loader2 } from 'lucide-react';

const MfaSetup = ({ onBack }) => {
  const [step, setStep] = useState('setup'); // setup, verify, complete, enabled
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [token, setToken] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const { toast } = useToast();

  // Check MFA status on mount
  useEffect(() => {
    const checkMfaStatus = async () => {
      try {
        const response = await api.get('/auth/me');
        if (response.data.mfaEnabled) {
          setStep('enabled');
        }
      } catch (error) {
        console.error('Failed to check MFA status:', error);
      }
    };
    checkMfaStatus();
  }, []);

  const handleSetup = async () => {
    setLoading(true);
    try {
      const response = await api.post('/auth/mfa/setup');
      const { secret: newSecret, qrCode: newQrCode } = response.data;
      setSecret(newSecret);
      setQrCode(newQrCode);
      setStep('verify');
      toast.success('Scan the QR code with your authenticator app');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to setup MFA';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!token || token.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }

    setVerifying(true);
    try {
      const response = await api.post('/auth/mfa/verify', { token });
      toast.success('MFA enabled successfully!');
      setStep('complete');
    } catch (error) {
      const message = error.response?.data?.message || 'Invalid MFA token';
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    const password = prompt('Enter your password to disable MFA:');
    if (!password) return;

    setDisabling(true);
    try {
      const response = await api.post('/auth/mfa/disable', { password });
      toast.success('MFA disabled successfully');
      setStep('setup');
      setSecret('');
      setQrCode('');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to disable MFA';
      toast.error(message);
    } finally {
      setDisabling(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Secret copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy secret');
    }
  };

  if (step === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6 p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 flex-1 text-center">MFA Setup</h2>
            <div className="w-10" />
          </div>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Enable Multi-Factor Authentication</h3>
            <p className="mt-2 text-gray-600 dark:text-slate-400 text-sm">
              Add an extra layer of security to your admin account by requiring a time-based one-time password (TOTP) from an authenticator app.
            </p>
          </div>

          <div className="space-y-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-slate-300">
              <Smartphone className="w-5 h-5 text-primary dark:text-blue-400 flex-shrink-0" />
              <span>Use any authenticator app: Google Authenticator, Authy, Microsoft Authenticator, etc.</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-slate-300">
              <QrCode className="w-5 h-5 text-primary dark:text-blue-400 flex-shrink-0" />
              <span>Scan the QR code or manually enter the secret key</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-slate-300">
              <CheckCircle className="w-5 h-5 text-primary dark:text-blue-400 flex-shrink-0" />
              <span>Enter the 6-digit code to verify and enable MFA</span>
            </div>
          </div>

          <button
            onClick={handleSetup}
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-50 transition-colors touch-manipulation min-h-[48px] text-base font-medium"
          >
            {loading ? (
              <>
                <span className="mr-2">Setting up...</span>
                <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
              </>
            ) : (
              <>
                <QrCode className="mr-2 w-4 h-4" />
                <span>Generate QR Code & Secret</span>
              </>
            )}
          </button>

          <button
            onClick={onBack}
            className="w-full flex items-center justify-center px-4 py-3 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors text-sm font-medium"
          >
            Back to Admin Panel
          </button>
        </div>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6 p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setStep('setup')}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 flex-1 text-center">MFA Setup</h2>
            <div className="w-10" />
          </div>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-8 h-8 text-primary dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Scan & Verify</h3>
            <p className="mt-2 text-gray-600 dark:text-slate-400 text-sm">
              Scan the QR code with your authenticator app, then enter the 6-digit code below.
            </p>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700">
              <img
                src={qrCode}
                alt="MFA QR Code"
                className="w-48 h-48 mx-auto"
              />
            </div>

            {/* Secret Key */}
            <div className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Secret Key</span>
                <button
                  onClick={copySecret}
                  className="flex items-center gap-1 text-sm text-primary dark:text-blue-400 hover:text-primary/80 dark:hover:text-blue-300 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={secret}
                  readOnly
                  className="flex-1 font-mono text-sm bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-3 py-2"
                />
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                  {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                Save this secret in a secure place. It can be used to recover access if you lose your device.
              </p>
            </div>
          </div>

          {/* Token Input */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
              Enter 6-digit code from authenticator app
            </label>
            <div className="relative">
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full text-center text-2xl sm:text-3xl tracking-widest font-mono border-2 border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg py-3 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 focus:border-transparent touch-manipulation min-h-[56px]"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <p className="text-center text-sm text-gray-500 dark:text-slate-400">
              The code changes every 30 seconds
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleVerify}
              disabled={verifying || token.length !== 6}
              className="w-full flex items-center justify-center px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-50 transition-colors touch-manipulation min-h-[48px] text-base font-medium"
            >
              {verifying ? (
                <>
                  <span className="mr-2">Verifying...</span>
                  <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 w-4 h-4" />
                  <span>Verify & Enable MFA</span>
                </>
              )}
            </button>

            <button
              onClick={() => setStep('setup')}
              className="w-full flex items-center justify-center px-4 py-3 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors text-sm font-medium"
            >
              Regenerate QR Code
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6 p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">MFA Enabled Successfully!</h3>
            <p className="mt-2 text-gray-600 dark:text-slate-400 text-sm">
              Your admin account is now protected with multi-factor authentication.
            </p>
          </div>

          <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3 text-sm text-green-800 dark:text-green-300">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span><strong>Important:</strong> Save your secret key in a secure location. You'll need it to recover access if you lose your authenticator device.</span>
            </div>
          </div>

          <button
            onClick={onBack}
            className="w-full flex items-center justify-center px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors touch-manipulation min-h-[48px] text-base font-medium"
          >
            <ArrowLeft className="mr-2 w-4 h-4" />
            <span>Back to Admin Panel</span>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'enabled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6 p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 flex-1 text-center">MFA Setup</h2>
            <div className="w-10" />
          </div>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-green-500 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">MFA Already Enabled</h3>
            <p className="mt-2 text-gray-600 dark:text-slate-400 text-sm">
              Your admin account is protected with multi-factor authentication.
            </p>
          </div>

          <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3 text-sm text-green-800 dark:text-green-300">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>MFA is active on this account</span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleDisable}
              disabled={disabling}
              className="w-full flex items-center justify-center px-4 py-3 bg-red-500 text-white rounded-lg disabled:opacity-50 transition-colors touch-manipulation min-h-[48px] text-base font-medium"
            >
              {disabling ? (
                <>
                  <span className="mr-2">Disabling...</span>
                  <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 w-4 h-4" />
                  <span>Disable MFA</span>
                </>
              )}
            </button>

            <button
              onClick={() => setStep('setup')}
              className="w-full flex items-center justify-center px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors touch-manipulation min-h-[48px] text-base font-medium"
            >
              <RefreshCw className="mr-2 w-4 h-4" />
              <span>Regenerate MFA (New QR Code)</span>
            </button>

            <button
              onClick={onBack}
              className="w-full flex items-center justify-center px-4 py-3 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors text-sm font-medium"
            >
              <ArrowLeft className="mr-2 w-4 h-4" />
              <span>Back to Admin Panel</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default MfaSetup;