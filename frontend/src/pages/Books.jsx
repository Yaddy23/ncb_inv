import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { ShoppingBag, Search, Plus, Barcode, Trash, Edit, Loader, CheckCircle, AlertTriangle, History, Filter, ArrowUp, ArrowDown, ChevronsUpDown, RotateCcw } from 'lucide-react';
import { useToast } from '../components/Toast';
import { Modal, Pagination, EmptyState, AlertBanner, Skeleton } from '../components/ui';
import { useDebounce } from '../hooks/useDebounce';

const Books = ({ user }) => {
  const navigate = useNavigate();
  const { confirmDialog } = useToast();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ subject: '', publisher: '', year: '', minPrice: '', maxPrice: '', stock: '' });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalBooks, setTotalBooks] = useState(0);
  const [selectedBook, setSelectedBook] = useState(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [formData, setFormData] = useState({
    ISBN: '',
    TITLE: '',
    AUTHOR: '',
    SUBJECT: '',
    EDITION: '',
    YEAR: '',
    BIND: '',
    PUBLISHER: '',
    QTY: 0,
    PRICE: 0.00
  });
  const [formError, setFormError] = useState(null);

  const debouncedSearch = useDebounce(search, 300);
  const debouncedFilters = useDebounce(filters, 300);

  // Per-book transaction history modal state
  const [historyBook, setHistoryBook] = useState(null);
  const [historyData, setHistoryData] = useState({ transactions: [], page: 1, pages: 0, total: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // Populate formData when selectedBook changes for editing
  useEffect(() => {
    setFormError(null); // Clear form error when modal opens
    if (selectedBook?.action === 'edit' && selectedBook?.book) {
      const book = selectedBook.book;
      setFormData({
        ISBN: book.ISBN || '',
        TITLE: book.TITLE || '',
        AUTHOR: book.AUTHOR || '',
        SUBJECT: book.SUBJECT || '',
        EDITION: book.EDITION || '',
        YEAR: book.YEAR || '',
        BIND: book.BIND || '',
        PUBLISHER: book.PUBLISHER || '',
        QTY: book.QTY || 0,
        PRICE: book.PRICE || 0.00
      });
    } else if (selectedBook?.action === 'create') {
      // Reset form for create
      setFormData({
        ISBN: '',
        TITLE: '',
        AUTHOR: '',
        SUBJECT: '',
        EDITION: '',
        YEAR: '',
        BIND: '',
        PUBLISHER: '',
        QTY: 0,
        PRICE: 0.00
      });
    }
  }, [selectedBook]);

  const fetchBooks = useCallback(async (isSearch = false) => {
    try {
      if (isSearch) {
        setIsSearching(true);
      } else {
        setLoading(true);
      }
      // Clear error on new fetch attempt
      setError(null);
      const params = { page, limit, search: debouncedSearch, sortBy, sortOrder };
      if (debouncedFilters.subject) params.subject = debouncedFilters.subject;
      if (debouncedFilters.publisher) params.publisher = debouncedFilters.publisher;
      if (debouncedFilters.year) params.year = debouncedFilters.year;
      if (debouncedFilters.minPrice !== '') params.minPrice = debouncedFilters.minPrice;
      if (debouncedFilters.maxPrice !== '') params.maxPrice = debouncedFilters.maxPrice;
      if (debouncedFilters.stock) params.stock = debouncedFilters.stock;
      if (showArchived) params.archived = 'true';

      const response = await api.get('/books', { params });

      setBooks(response.data.books);
      setTotalPages(response.data.pages);
      setTotalBooks(response.data.total);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load books');
    } finally {
      if (isSearch) {
        setIsSearching(false);
      } else {
        setLoading(false);
      }
    }
  }, [page, limit, debouncedSearch, debouncedFilters, sortBy, sortOrder, showArchived]);

  const isInitialLoad = useRef(true);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearch(value);
    setPage(1); // Reset to first page when searching
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(1); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({ subject: '', publisher: '', year: '', minPrice: '', maxPrice: '', stock: '' });
    setPage(1);
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  // Sortable <th> for the desktop table; first click sorts A-Z, second Z-A
  const sortHeader = (label, field, widthClass, extra = null) => (
    <th className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider truncate dark:text-slate-400 ${widthClass || ''}`}>
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="group inline-flex items-center space-x-1 hover:text-gray-700 dark:hover:text-slate-200"
      >
        <span className="truncate">{label}</span>
        {sortBy === field ? (
          sortOrder === 'asc'
            ? <ArrowUp className="w-3.5 h-3.5 text-primary flex-shrink-0 dark:text-blue-400" />
            : <ArrowDown className="w-3.5 h-3.5 text-primary flex-shrink-0 dark:text-blue-400" />
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 flex-shrink-0 dark:text-slate-500 dark:group-hover:text-slate-300" />
        )}
        {extra}
      </button>
    </th>
  );

  // Single effect for all data fetching
  useEffect(() => {
    const isSearch = !isInitialLoad.current && (page === 1);
    isInitialLoad.current = false;
    fetchBooks(isSearch);
  }, [fetchBooks]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  const getActionBadgeClass = (action) => {
    if (action === 'INBOUND') return 'bg-green-100 text-green-700 dark:bg-emerald-500/20 dark:text-emerald-400';
    if (action === 'OUTBOUND') return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
    return 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300';
  };

  const openHistory = (book) => {
    setHistoryBook(book);
    setHistoryPage(1);
  };

  // Fetch the selected book's transaction history
  useEffect(() => {
    if (!historyBook) return;
    let cancelled = false;
    const fetchHistory = async () => {
      try {
        setHistoryLoading(true);
        const response = await api.get(`/books/${encodeURIComponent(historyBook.ISBN)}/transactions`, {
          params: { page: historyPage, limit: 10 }
        });
        if (!cancelled) {
          setHistoryData({
            transactions: response.data.transactions,
            page: response.data.page,
            pages: response.data.pages,
            total: response.data.total
          });
        }
      } catch (err) {
        if (!cancelled) {
          setHistoryData({ transactions: [], page: 1, pages: 0, total: 0 });
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [historyBook, historyPage]);

  const handleDeleteBook = async (isbn) => {
    if (deleteMode) {
      const book = books.find(b => b.ISBN === isbn);
      const sure = await confirmDialog(
        `Archive "${book?.TITLE || isbn}"? This book will be hidden from the catalog. Its stock history is preserved.`,
        { title: 'Archive Book', danger: true, confirmText: 'Archive' }
      );
      if (!sure) return;
      try {
        await api.delete(`/books/${isbn}`);
        setDeleteMode(false);
        // Refresh books list (fetchBooks applies current page/search/filters/sort)
        await fetchBooks(false);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to archive book');
      }
    } else {
      setDeleteMode(true);
    }
  };

  const handleRestoreBook = async (isbn) => {
    const book = books.find(b => b.ISBN === isbn);
    const sure = await confirmDialog(
      `Restore "${book?.TITLE || isbn}"? This will make the book visible in the catalog again.`,
      { title: 'Restore Book', confirmText: 'Restore' }
    );
    if (!sure) return;
    try {
      await api.put(`/books/${isbn}/restore`);
      // Refresh books list
      await fetchBooks(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to restore book');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-3 dark:text-slate-100">
            <ShoppingBag className="w-5 h-5 text-primary dark:text-blue-400" />
            Book Catalog
          </h1>
          <p className="mt-2 text-gray-600 dark:text-slate-400">Manage your book inventory</p>
        </div>

        {/* Search and Controls (placeholder while the list loads) */}
        <div className="mb-6">
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>

        {/* List skeleton - responsive: cards on mobile, table on desktop */}
        <div className="bg-white rounded-lg shadow dark:bg-slate-900">
          {/* Mobile Card Skeletons */}
          <div className="block md:hidden">
            <div className="divide-y divide-gray-200 dark:divide-slate-800">
              {[0, 1, 2].map((i) => (
                <div key={i} className="p-4 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ))}
            </div>
          </div>

          {/* Desktop Table Skeleton - real thead anchors the layout */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 table-fixed">
              <thead className="bg-gray-50 dark:bg-slate-800/60">
                <tr>
                  {sortHeader('Subject', 'SUBJECT', 'w-[150px]')}
                  {sortHeader('ISBN', 'ISBN', 'w-[120px]')}
                  {sortHeader('Title', 'TITLE', 'w-[300px]')}
                  {sortHeader('Author', 'AUTHOR', 'w-[200px]')}
                  {sortHeader('Year', 'YEAR', 'w-[200px]')}
                  {sortHeader('Publisher', 'PUBLISHER', 'w-[200px]')}
                  {sortHeader('Qty', 'QTY', 'w-[80px]')}
                  {sortHeader('Price', 'PRICE', 'w-[100px]')}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider truncate dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900">
                {[0, 1, 2, 3, 4].map((row) => (
                  <tr key={row}>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-3/4" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-3/4" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-3/4" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-3/4" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-3/4" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {error && (
        <AlertBanner tone="error" className="mb-6" onClose={() => setError(null)}>
          {error}
        </AlertBanner>
      )}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-3 dark:text-slate-100">
          <ShoppingBag className="w-5 h-5 text-primary dark:text-blue-400" />
          Book Catalog
        </h1>
        <p className="mt-2 text-gray-600 dark:text-slate-400">Manage your book inventory</p>
      </div>

      {/* Search and Controls */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search books by title, author, ISBN..."
              value={search}
              onChange={handleSearchChange}
              className="w-full px-4 py-3 pl-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 justify-end">
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className={`relative flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-colors touch-manipulation min-h-[44px] min-w-[140px] ${
              showFilters || activeFilterCount > 0
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Filter className="w-5 h-5" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {user.role === 'Admin' && (
            <button
              onClick={() => setSelectedBook({ action: 'create' })}
              className="flex items-center justify-center space-x-2 px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors touch-manipulation min-h-[44px] min-w-[140px]"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Add New Book</span>
            </button>
          )}
          <button
            onClick={() => navigate('/scan')}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors touch-manipulation min-h-[44px] min-w-[140px]"
          >
            <Barcode className="w-5 h-5" />
            <span className="hidden sm:inline">Scan Books</span>
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Subject</label>
              <input
                type="text"
                placeholder="e.g. Mathematics"
                value={filters.subject}
                onChange={(e) => handleFilterChange('subject', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm min-h-[44px] touch-manipulation dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Publisher</label>
              <input
                type="text"
                placeholder="e.g. Pearson"
                value={filters.publisher}
                onChange={(e) => handleFilterChange('publisher', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm min-h-[44px] touch-manipulation dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Year</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 2018"
                value={filters.year}
                onChange={(e) => handleFilterChange('year', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm min-h-[44px] touch-manipulation dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Stock</label>
              <select
                value={filters.stock}
                onChange={(e) => handleFilterChange('stock', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm min-h-[44px] touch-manipulation dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500 bg-white dark:bg-slate-900"
              >
                <option value="">All</option>
                <option value="in">In stock</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Min Price (₱)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={filters.minPrice}
                onChange={(e) => handleFilterChange('minPrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm min-h-[44px] touch-manipulation dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Max Price (₱)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Any"
                value={filters.maxPrice}
                onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm min-h-[44px] touch-manipulation dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Show archived checkbox (Admin only) */}
          {user.role === 'Admin' && (
            <div className="mt-3 flex items-center">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => {
                    setShowArchived(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary focus:ring-2 dark:text-blue-400 dark:border-slate-600 dark:focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">Show archived books</span>
              </label>
            </div>
          )}

          {/* Mobile sorting - desktop sorts by clicking table headers */}
          <div className="mt-3 md:hidden">
            <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Sort by</label>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split(':');
                setSortBy(field);
                setSortOrder(order);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm min-h-[44px] touch-manipulation dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500 bg-white dark:bg-slate-900"
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="TITLE:asc">Title (A–Z)</option>
              <option value="TITLE:desc">Title (Z–A)</option>
              <option value="AUTHOR:asc">Author (A–Z)</option>
              <option value="QTY:desc">Quantity (high–low)</option>
              <option value="PRICE:asc">Price (low–high)</option>
              <option value="PRICE:desc">Price (high–low)</option>
            </select>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed touch-manipulation min-h-[44px] dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {/* Books Table - Responsive: Cards on mobile, Table on desktop */}
      <div className="bg-white rounded-lg shadow dark:bg-slate-900">
        {/* Mobile Card Layout */}
        <div className="block md:hidden">
          {books.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={showArchived ? 'No archived books' : 'No books found'} message={showArchived ? 'No books have been archived yet.' : (activeFilterCount > 0 ? 'No books match your filters. Try clearing them.' : 'Try searching or adding new books.')} />
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-slate-800">
              {books.map((book) => (
                <div key={book.ISBN} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-800/60">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate dark:text-slate-100">{book.TITLE}</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">by {book.AUTHOR || 'Unknown Author'}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {book.isArchived ? (
                        <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300">
                          Archived
                        </span>
                      ) : (
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                          book.QTY > 0 ? 'bg-green-100 text-green-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                        }`}>
                          {book.QTY > 0 ? `${book.QTY} in stock` : 'Out of stock'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">ISBN:</span>
                      <span className="font-mono text-gray-900 ml-1 dark:text-slate-100">{book.ISBN}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Year:</span>
                      <span className="text-gray-900 ml-1 dark:text-slate-100">{book.YEAR || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Publisher:</span>
                      <span className="text-gray-900 ml-1 dark:text-slate-100">{book.PUBLISHER || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Price:</span>
                      <span className="font-medium text-gray-900 ml-1 dark:text-slate-100">₱{Number(book.PRICE || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openHistory(book)}
                      disabled={deleteMode}
                      className="flex-1 min-w-[120px] flex items-center justify-center space-x-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors touch-manipulation disabled:opacity-50 min-h-[44px]"
                    >
                      <History className="w-4 h-4" />
                      <span>History</span>
                    </button>
                    {book.isArchived ? (
                      <button
                        onClick={() => handleRestoreBook(book.ISBN)}
                        className="flex-1 min-w-[120px] flex items-center justify-center space-x-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors touch-manipulation min-h-[44px]"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Restore</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setSelectedBook({ action: 'edit', book })}
                          disabled={deleteMode && selectedBook?.action !== 'delete'}
                          className="flex-1 min-w-[120px] flex items-center justify-center space-x-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors touch-manipulation disabled:opacity-50 min-h-[44px]"
                        >
                          <Edit className="w-4 h-4" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteBook(book.ISBN)}
                          disabled={deleteMode && selectedBook?.action !== 'delete' && selectedBook?.action !== undefined}
                          className={`flex-1 min-w-[120px] flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg touch-manipulation min-h-[44px] transition-colors disabled:opacity-50 ${
                            deleteMode && selectedBook?.action === 'delete' && selectedBook?.book?.ISBN === book.ISBN
                              ? 'bg-red-500 text-white hover:bg-red-600'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {deleteMode && selectedBook?.action === 'delete' && selectedBook?.book?.ISBN === book.ISBN ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              <span>Confirm</span>
                            </>
                          ) : (
                            <>
                              <Trash className="w-4 h-4" />
                              <span>Delete</span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop Table Layout */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 table-fixed">
            <thead className="bg-gray-50 dark:bg-slate-800/60">
              <tr>
                {sortHeader('Subject', 'SUBJECT', 'w-[150px]')}
                {sortHeader('ISBN', 'ISBN', 'w-[120px]')}
                {sortHeader('Title', 'TITLE', 'w-[300px]', isSearching && <Loader className="w-4 h-4 text-primary dark:text-blue-400 animate-spin flex-shrink-0" />)}
                {sortHeader('Author', 'AUTHOR', 'w-[200px]')}
                {sortHeader('Year', 'YEAR', 'w-[200px]')}
                {sortHeader('Publisher', 'PUBLISHER', 'w-[200px]')}
                {sortHeader('Qty', 'QTY', 'w-[80px]')}
                {sortHeader('Price', 'PRICE', 'w-[100px]')}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider truncate dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
              {books.length === 0 ? (
                <EmptyState colSpan={9} icon={ShoppingBag} title={showArchived ? 'No archived books' : 'No books found'} message={showArchived ? 'No books have been archived yet.' : 'Try searching or adding new books.'} />
              ) : (
                books.map((book) => (
                  <tr key={book.ISBN} className="hover:bg-gray-50 dark:hover:bg-slate-800/60">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-slate-300 truncate max-w-[150px]">{book.SUBJECT || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 max-w-[120px] dark:text-slate-100">{book.ISBN}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-slate-300 truncate max-w-[300px]">{book.TITLE}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-slate-300 truncate max-w-[200px]">{book.AUTHOR || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-slate-300 truncate max-w-[200px]">{book.YEAR || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-slate-300 truncate max-w-[200px]">{book.PUBLISHER || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium dark:text-slate-100">
                      {book.isArchived ? (
                        <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300">Archived</span>
                      ) : (
                        book.QTY > 0 ? book.QTY : <span className="text-red-600 dark:text-red-400">Out of stock</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-slate-100">₱{Number(book.PRICE || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openHistory(book)}
                          className="flex items-center justify-center px-3 py-1 bg-gray-200 text-gray-800 text-xs rounded-md hover:bg-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                          disabled={deleteMode}
                          title="Transaction history"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {book.isArchived ? (
                          <button
                            onClick={() => handleRestoreBook(book.ISBN)}
                            className="flex items-center justify-center px-3 py-1 bg-green-500 text-white text-xs rounded-md hover:bg-green-600 transition-colors"
                            title="Restore book"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setSelectedBook({ action: 'edit', book })}
                              className="flex items-center justify-center px-3 py-1 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
                              disabled={deleteMode && selectedBook?.action !== 'delete'}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBook(book.ISBN)}
                              className={
                                deleteMode && selectedBook?.action === 'delete' && selectedBook?.book?.ISBN === book.ISBN
                                  ? 'flex items-center justify-center px-3 py-1 bg-red-500 text-white text-xs rounded-md hover:bg-red-600 transition-colors disabled:opacity-50'
                                  : 'flex items-center justify-center px-3 py-1 bg-gray-200 text-gray-800 text-xs rounded-md hover:bg-gray-300 dark:bg-slate-800 dark:text-slate-200 transition-colors disabled:opacity-50'
                              }
                              disabled={deleteMode && selectedBook?.action !== 'delete' && selectedBook?.action !== undefined}
                            >
                              {deleteMode && selectedBook?.action === 'delete' && selectedBook?.book?.ISBN === book.ISBN ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : (
                                <Trash className="w-4 h-4" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={totalBooks}
        limit={limit}
        onPageChange={handlePageChange}
        label="books"
      />

      {/* Add/Edit Book Modal - Full-screen on mobile, centered on desktop */}
      <Modal
        open={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        title={selectedBook?.action === 'create' ? 'Add New Book' : 'Edit Book'}
        size="md"
      >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setLoading(true);
                  let response;

                  if (selectedBook.action === 'create') {
                    response = await api.post('/books', formData);
                  } else if (selectedBook.action === 'edit') {
                    response = await api.put(`/books/${selectedBook.book.ISBN}`, formData);
                  }

                  setSelectedBook(null);
                  // Refresh books list (fetchBooks applies current page/search/filters/sort)
                  await fetchBooks(false);
                } catch (err) {
                  setFormError(err.response?.data?.message || 'Failed to save book');
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4 md:space-y-3"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">ISBN</label>
                <input
                  type="text"
                  name="ISBN"
                  value={formData.ISBN || ''}
                  onChange={(e) => setFormData({...formData, ISBN: e.target.value})}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Title</label>
                <input
                  type="text"
                  name="TITLE"
                  value={formData.TITLE || ''}
                  onChange={(e) => setFormData({...formData, TITLE: e.target.value})}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Author</label>
                  <input
                    type="text"
                    name="AUTHOR"
                    value={formData.AUTHOR || ''}
                    onChange={(e) => setFormData({...formData, AUTHOR: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Subject</label>
                  <input
                    type="text"
                    name="SUBJECT"
                    value={formData.SUBJECT || ''}
                    onChange={(e) => setFormData({...formData, SUBJECT: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Year</label>
                  <input
                    type="text"
                    name="YEAR"
                    value={formData.YEAR || ''}
                    onChange={(e) => setFormData({...formData, YEAR: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Edition</label>
                  <input
                    type="text"
                    name="EDITION"
                    value={formData.EDITION || ''}
                    onChange={(e) => setFormData({...formData, EDITION: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Binding</label>
                  <input
                    type="text"
                    name="BIND"
                    value={formData.BIND || ''}
                    onChange={(e) => setFormData({...formData, BIND: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Publisher</label>
                  <input
                    type="text"
                    name="PUBLISHER"
                    value={formData.PUBLISHER || ''}
                    onChange={(e) => setFormData({...formData, PUBLISHER: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Quantity</label>
                  <input
                    type="number"
                    name="QTY"
                    value={formData.QTY || ''}
                    onChange={(e) => setFormData({...formData, QTY: parseInt(e.target.value) || 0})}
                    min="0"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Price</label>
                  <input
                    type="number"
                    name="PRICE"
                    value={formData.PRICE || ''}
                    onChange={(e) => setFormData({...formData, PRICE: parseFloat(e.target.value) || 0.0})}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent touch-manipulation min-h-[44px] text-base dark:border-slate-600 dark:placeholder-slate-500 dark:focus:ring-blue-500"
                  />
                </div>
              </div>

              {formError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-600 dark:bg-red-500/15 dark:border-red-500/40 dark:text-red-400">
                  {formError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mt-4 md:mt-6 pt-4 border-t border-gray-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedBook(null)}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-3 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors touch-manipulation min-h-[44px] min-w-[120px]"
                >
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-50 transition-colors touch-manipulation min-h-[44px] min-w-[120px]"
                >
                  {loading ? (
                    <>
                      <span>Saving...</span>
                      <svg className="animate-spin w-5 h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                      </svg>
                    </>
                  ) : (
                    <>
                      <span>{selectedBook?.action === 'create' ? 'Add Book' : 'Update Book'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
      </Modal>

      {/* Transaction History Modal */}
      <Modal
        open={!!historyBook}
        onClose={() => setHistoryBook(null)}
        title={
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100">Stock History</h2>
            <p className="text-sm text-gray-500 truncate font-normal dark:text-slate-400">{historyBook?.TITLE} · {historyBook?.ISBN}</p>
          </div>
        }
        size="md"
      >
        {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 text-primary animate-spin dark:text-blue-400" />
                <span className="ml-2 text-primary dark:text-blue-400">Loading history...</span>
              </div>
            ) : historyData.transactions.length === 0 ? (
              <div className="py-8 text-center text-gray-500 dark:text-slate-400">
                <History className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-slate-500" />
                <p>No transactions yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historyData.transactions.map((t) => (
                  <div key={t._id} className="p-3 bg-gray-50 rounded-lg dark:bg-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getActionBadgeClass(t.action)}`}>{t.action}</span>
                      <span className={`text-sm font-bold ${t.qtyChanged > 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {t.qtyChanged > 0 ? '+' : ''}{t.qtyChanged}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate dark:text-slate-400">
                      {t.previousQty} → {t.newQty} · {t.performedBy?.username || 'Unknown'} · {new Date(t.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {historyData.total > 10 && (
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-sm text-gray-500 dark:text-slate-400">Page {historyData.page} of {historyData.pages}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryPage(Math.max(1, historyPage - 1))}
                    disabled={historyPage === 1 || historyLoading}
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors touch-manipulation min-h-[44px] dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setHistoryPage(Math.min(historyData.pages, historyPage + 1))}
                    disabled={historyPage === historyData.pages || historyLoading}
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors touch-manipulation min-h-[44px] dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
      </Modal>
    </div>
  );
};

export default Books;