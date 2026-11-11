import React from 'react';
import { useEffect, useState } from 'react';
import api from '../api/axios';
import { Wrench, Clock, AlertCircle, UserShield, Loader2 } from 'lucide-react';

function Maintenance() {
  const [maintenanceInfo, setMaintenanceInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const response = await api.get('/maintenance/status');
        setMaintenanceInfo(response.data);

        // Check if user is admin (try to get user profile)
        try {
          const userResponse = await api.get('/auth/me');
          if (userResponse.data.role === 'Admin') {
            setIsAdmin(true);
          }
        } catch (e) {
          // Not authenticated or not admin
        }
      } catch (error) {
        console.error('Failed to fetch maintenance status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkMaintenance();

    // Poll every 30 seconds for updates
    const interval = setInterval(checkMaintenance, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!maintenanceInfo?.maintenanceMode) {
    return null; // Not in maintenance mode, let App handle routing
  }

  const formatEstimatedEnd = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Maintenance Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-6">
            <Wrench className="w-10 h-10 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-4">
          System Maintenance
        </h1>

        {/* Message */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 mb-6 shadow-sm border border-gray-200 dark:border-slate-800">
          <p className="text-gray-600 dark:text-slate-300 text-lg mb-4">
            {maintenanceInfo.message || 'System is under maintenance. Please check back later.'}
          </p>

          {maintenanceInfo.estimatedEnd && (
            <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
              <Clock className="w-5 h-5" />
              <span className="font-medium">
                Estimated completion: {formatEstimatedEnd(maintenanceInfo.estimatedEnd)}
              </span>
            </div>
          )}
        </div>

        {/* Admin Access Notice */}
        {isAdmin && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-blue-700 dark:text-blue-300 mb-2">
              <UserShield className="w-5 h-5" />
              <span className="font-medium">Administrator Access</span>
            </div>
            <p className="text-blue-600 dark:text-blue-400 text-sm">
              You are logged in as an administrator. <a href="/" className="underline hover:text-blue-700 dark:hover:text-blue-300">Access the system</a>
            </p>
          </div>
        )}

        {/* Info */}
        <div className="text-sm text-gray-500 dark:text-slate-500">
          <p>We&apos;re working to improve your experience.</p>
          <p className="mt-1">Please check back in a few minutes.</p>
        </div>

        {/* Auto-refresh indicator */}
        <div className="mt-8 flex items-center justify-center gap-2 text-gray-400 dark:text-slate-600 text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Checking for updates automatically...</span>
        </div>
      </div>
    </div>
  );
}

export default Maintenance;