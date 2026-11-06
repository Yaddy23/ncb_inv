import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
  ScanBarcode, ShoppingBag, Plus, Users, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, Package, SlidersHorizontal, Activity,
  Bookmark, RotateCcw
} from 'lucide-react';
import StockMovementChart from '../components/dashboard/StockMovementChart';
import { Modal, Skeleton } from '../components/ui';
import { useCountUp } from '../hooks/useCountUp';

// Feed icon + tint per action; inbound/outbound reuse the chart's series
// colors so the two views read as the same entities. Colors are CSS vars
// (light + dark steps in index.css) because these chips are inline-styled.
const ACTION_STYLES = {
  INBOUND: { icon: ArrowDownCircle, color: 'var(--accent-inbound-fg)', bg: 'var(--accent-inbound-bg)' },
  OUTBOUND: { icon: ArrowUpCircle, color: 'var(--accent-outbound-fg)', bg: 'var(--accent-outbound-bg)' },
  ADJUSTMENT: { icon: SlidersHorizontal, color: 'var(--accent-neutral-fg)', bg: 'var(--accent-neutral-bg)' },
  BULK_IMPORT: { icon: Package, color: 'var(--accent-neutral-fg)', bg: 'var(--accent-neutral-bg)' },
  RESERVE: { icon: Bookmark, color: 'var(--accent-reserve-fg)', bg: 'var(--accent-reserve-bg)' },
  RELEASE: { icon: RotateCcw, color: 'var(--accent-release-fg)', bg: 'var(--accent-release-bg)' },
};

// Human labels for actions whose raw name doesn't read as a sentence
// (RESERVE/RELEASE are DR-draft reservation holds - stock QTY doesn't move)
const ACTION_LABELS = {
  BULK_IMPORT: 'Bulk import',
  ADJUSTMENT: 'Adjustment',
  RESERVE: 'Book QTY reserved',
  RELEASE: 'Reserved book QTY returned'
};

const timeAgo = (date) => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};

const RecentActivity = ({ transactions }) => {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center">
        <p className="text-sm text-gray-400 dark:text-slate-500">No recent stock activity</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-slate-800">
      {transactions.map(t => {
        const style = ACTION_STYLES[t.action] || ACTION_STYLES.ADJUSTMENT;
        const Icon = style.icon;
        const isReservationHold = t.action === 'RESERVE' || t.action === 'RELEASE';
        const qty = t.qtyChanged > 0 ? `+${t.qtyChanged}` : `${t.qtyChanged}`;
        return (
          <li key={t._id} className="flex items-start space-x-3 py-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ color: style.color, backgroundColor: style.bg }}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900 dark:text-slate-100 truncate">
                <span className="font-medium">{t.title || t.ISBN}</span>
                {!isReservationHold && <span className="ml-2 font-semibold">{qty}</span>}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                {ACTION_LABELS[t.action] || t.action.charAt(0) + t.action.slice(1).toLowerCase()}
                {' · '}
                {t.performedBy?.username || 'Unknown'}
                {' · '}
                {timeAgo(t.createdAt)}
              </p>
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0 pt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
              QTY {t.newQty}
            </p>
          </li>
        );
      })}
    </ul>
  );
};

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalBooks: 0,
    totalQuantity: 0,
    todayTransactions: 0
  });
  const [outOfStock, setOutOfStock] = useState({ books: [], count: 0 });
  const [reservations, setReservations] = useState({
    holds: [],
    summary: { totalHolds: 0, totalUnits: 0, staleCount: 0 }
  });
  const [movement, setMovement] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showOutOfStockModal, setShowOutOfStockModal] = useState(false);

  // Feature 35: ease-out count-up on the three headline stats. The hook
  // re-runs when stats arrive late, so values still land correctly.
  const animatedTotalBooks = useCountUp(stats.totalBooks);
  const animatedTotalQuantity = useCountUp(stats.totalQuantity);
  const animatedTodayTransactions = useCountUp(stats.todayTransactions);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const [statsResponse, outOfStockResponse, summaryResponse, recentResponse, reservationsResponse] = await Promise.all([
          api.get('/books/stats'),
          api.get('/books/out-of-stock'),
          api.get('/stock/summary', { params: { days: 14 } }),
          api.get('/stock/recent', { params: { limit: 12 } }),
          // Non-fatal: reservations failing must never take down the dashboard
          api.get('/stock/reservations').catch(() => ({
            data: { holds: [], summary: { totalHolds: 0, totalUnits: 0, staleCount: 0 } }
          }))
        ]);

        setStats({
          totalBooks: statsResponse.data.totalBooks,
          totalQuantity: statsResponse.data.totalQuantity,
          todayTransactions: statsResponse.data.todayTransactions
        });
        setOutOfStock({
          books: outOfStockResponse.data.books || [],
          count: outOfStockResponse.data.count || 0
        });
        setMovement(summaryResponse.data.perDay || []);
        setRecent(recentResponse.data.transactions || []);
        setReservations({
          holds: reservationsResponse.data.holds || [],
          summary: {
            totalHolds: 0,
            totalUnits: 0,
            staleCount: 0,
            ...(reservationsResponse.data.summary || {})
          }
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard stats');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 h-28 p-5 sm:p-6 flex flex-col justify-center space-y-3"
            >
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
        <div className="mt-6 sm:mt-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-5 sm:p-6">
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="mt-6 sm:mt-8 space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <div className="bg-red-50 dark:bg-red-500/15 border-l-4 border-red-400 dark:border-red-500/50 p-4 mb-6 rounded-r-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center space-x-3">
          <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-primary dark:text-blue-400" />
          Dashboard Overview
        </h1>
        <p className="mt-2 text-gray-600 dark:text-slate-400">Welcome back, {user.username}! Here's your inventory overview.</p>
      </div>

      {/* Quick Actions - Horizontal layout, responsive */}
      <div className="mt-4 sm:mt-6 mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-100 mb-3 sm:mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <button
            onClick={() => navigate('/scan')}
            className="bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between border border-gray-100 dark:border-slate-800 touch-manipulation min-h-[48px] text-left"
          >
            <div className="flex-1 min-w-0 mb-3 sm:mb-0">
              <p className="text-sm sm:text-base font-medium text-gray-700 dark:text-slate-300 truncate">Scan Books</p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">Use barcode scanner or camera</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center flex-shrink-0 ml-3 sm:ml-4">
              <ScanBarcode className="w-5 h-5 sm:w-6 sm:h-6 text-primary dark:text-blue-400" />
            </div>
          </button>

          <button
            onClick={() => navigate('/books')}
            className="bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between border border-gray-100 dark:border-slate-800 touch-manipulation min-h-[48px] text-left"
          >
            <div className="flex-1 min-w-0 mb-3 sm:mb-0">
              <p className="text-sm sm:text-base font-medium text-gray-700 dark:text-slate-300 truncate">Manage Books</p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">View and edit book catalog</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center flex-shrink-0 ml-3 sm:ml-4">
              <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-primary dark:text-blue-400" />
            </div>
          </button>

          {user.role === 'Admin' && (
            <button
              onClick={() => navigate('/import-export')}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between border border-gray-100 dark:border-slate-800 touch-manipulation min-h-[48px] text-left"
            >
              <div className="flex-1 min-w-0 mb-3 sm:mb-0">
                <p className="text-sm sm:text-base font-medium text-gray-700 dark:text-slate-300 truncate">Import/Export</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">Bulk operations</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center flex-shrink-0 ml-3 sm:ml-4">
                <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-primary dark:text-blue-400" />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Total Books */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-5 sm:p-6 border border-gray-100 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-medium text-gray-500 dark:text-slate-400 truncate">Total Book Titles</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">{animatedTotalBooks}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-primary dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* Total Quantity */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-5 sm:p-6 border border-gray-100 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-medium text-gray-500 dark:text-slate-400 truncate">Total Units in Stock</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">{animatedTotalQuantity}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
              <ScanBarcode className="w-5 h-5 sm:w-6 sm:h-6 text-primary dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* Today's Transactions */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-5 sm:p-6 border border-gray-100 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-medium text-gray-500 dark:text-slate-400 truncate">Today's Transactions</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">{animatedTodayTransactions}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* Out of Stock */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-5 sm:p-6 border border-gray-100 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-medium text-gray-500 dark:text-slate-400 truncate">Out of Stock Titles</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">{outOfStock.count}</p>
              {outOfStock.count === 0 ? (
                <p className="text-xs sm:text-sm text-green-600 dark:text-emerald-400 mt-1">No out of stock items</p>
              ) : (
                <button
                  onClick={() => setShowOutOfStockModal(true)}
                  className="mt-2 px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary/90"
                >
                  View Details
                </button>
              )}
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 dark:bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0 ml-3">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </div>

        {/* Active Reservations (Admin only — the page itself is admin-gated) */}
        {user.role === 'Admin' && (
        <Link
          to="/reservations"
          className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-5 sm:p-6 border border-gray-100 dark:border-slate-800 transition-all duration-200 hover:shadow-md hover:border-primary/40 dark:hover:border-blue-500/40"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-medium text-gray-500 dark:text-slate-400 truncate">Active Reservations</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">{reservations.summary.totalUnits}</p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">
                {reservations.summary.totalHolds} holds
                {' · '}
                <span className={reservations.summary.staleCount > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}>
                  {reservations.summary.staleCount} stale
                </span>
              </p>
            </div>
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ml-3"
              style={{ color: 'var(--accent-reserve-fg)', backgroundColor: 'var(--accent-reserve-bg)' }}
            >
              <Bookmark className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>
        </Link>
        )}
      </div>

      {/* Stock movement chart + recent activity */}
      <div className="mt-6 sm:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-5 sm:p-6">
          <StockMovementChart data={movement} />
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-5 sm:p-6">
          <div className="flex items-center space-x-2 mb-2">
            <Activity className="w-4 h-4 text-primary dark:text-blue-400" />
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">Recent Activity</h3>
          </div>
          <RecentActivity transactions={recent} />
        </div>
      </div>

      {/* Out of Stock Modal */}
      <Modal open={showOutOfStockModal} onClose={() => setShowOutOfStockModal(false)} title="Out of Stock Books" size="sm">
        {outOfStock.books.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">{outOfStock.count} out of stock title{outOfStock.count === 1 ? '' : 's'}</p>
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {outOfStock.books.map((book) => (
                <li key={book.ISBN} className="flex items-start space-x-3 py-2">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'var(--accent-warn-bg)' }}>
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 dark:text-slate-100 truncate">
                      <span className="font-medium">{book.TITLE}</span>
                      <span className="ml-2 text-gray-500 dark:text-slate-400">ISBN: {book.ISBN}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {outOfStock.count > outOfStock.books.length && (
              <p className="text-sm text-gray-500 dark:text-slate-400 pt-2 border-t border-gray-100 dark:border-slate-800 mt-2">
                …and {outOfStock.count - outOfStock.books.length} more. Use the Books page with the "Out of stock" filter to see them all.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-slate-400">No out of stock books</p>
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;
