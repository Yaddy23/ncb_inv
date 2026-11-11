# Maintenance Mode Toggle in AdminPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Maintenance" tab to the AdminPanel with a toggle button, message input, and estimated end time input to control maintenance mode.

**Architecture:** The AdminPanel is a React component with tabbed interface. We'll add a new "Maintenance" tab that fetches current settings via GET /api/maintenance/settings and allows toggling via POST /api/maintenance/toggle. The component follows existing patterns for API calls, state management, and UI styling.

**Tech Stack:** React, lucide-react icons, existing UI components (Modal, AlertBanner), Axios for API calls

**Spec:** This plan implements the maintenance mode admin UI based on the existing backend endpoints in backend/routes/maintenance.js and backend/controllers/maintenanceController.js

## Global Constraints

- Follow existing AdminPanel patterns for tabs, state management, and API calls
- Use existing UI components (Modal, AlertBanner, Pagination, etc.)
- Use lucide-react icons consistent with existing tabs (Wrench for maintenance)
- Follow dark mode styling patterns (dark: variants with slate palette)
- Mobile-first responsive design with card/table layouts
- Use existing toast notifications for success/error messages
- Reuse existing confirmDialog for dangerous actions

## Review Focus

1. **Maintenance mode toggle doesn't persist** - API call fails silently, user thinks it worked
2. **Race condition on concurrent toggles** - Two admins toggle simultaneously
3. **Invalid estimated end time format** - Backend rejects malformed date, frontend doesn't validate
4. **Empty maintenance message** - Backend may require message, frontend allows empty
5. **Stale cache after toggle** - UI shows old state until next poll or manual refresh

---

### Task 1: Add Maintenance Tab Button and State

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx` (around lines 24-25, 559-606)

**Interfaces:**
- Consumes: existing `activeTab`, `setActiveTab` state; existing `loading`, `setLoading`, `setError`, `setSuccess`, `toast`
- Produces: New tab value `'maintenance'` in activeTab

- [ ] **Step 1: Add maintenance tab state variables**

Add state for maintenance settings:
```javascript
const [maintenanceSettings, setMaintenanceSettings] = useState({
  maintenanceMode: false,
  message: '',
  estimatedEnd: ''
});
const [maintenanceLoading, setMaintenanceLoading] = useState(false);
```

- [ ] **Step 2: Add maintenance tab button in tabs section**

Add a new button in the tabs div (around line 597-605) with Wrench icon:
```javascript
<button
  onClick={() => { setActiveTab('maintenance'); fetchMaintenanceSettings(); }}
  className={...}
>
  <Wrench className="w-4 h-4 inline mr-1" />
  Maintenance
</button>
```

- [ ] **Step 3: Import Wrench icon from lucide-react**

Add `Wrench` to the import statement at line 3.

- [ ] **Step 4: Verify the tab appears and is clickable**

Run the dev server and check AdminPanel renders the new tab.

---

### Task 2: Implement fetchMaintenanceSettings Function

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx` (add new function after fetchSessions, around line 355)

**Interfaces:**
- Consumes: `api` from '../api/axios', `setMaintenanceSettings`, `setMaintenanceLoading`, `setError`, `toast`
- Produces: Populates `maintenanceSettings` state with response from GET /api/maintenance/settings

- [ ] **Step 1: Write fetchMaintenanceSettings function**

```javascript
const fetchMaintenanceSettings = async () => {
  setMaintenanceLoading(true);
  try {
    const response = await api.get('/maintenance/settings');
    setMaintenanceSettings(response.data);
    setError('');
  } catch (err) {
    setError('Failed to fetch maintenance settings');
    console.error(err);
    toast.error('Failed to load maintenance settings');
  } finally {
    setMaintenanceLoading(false);
  }
};
```

- [ ] **Step 2: Call fetchMaintenanceSettings when maintenance tab is activated**

Add to the tab button onClick handler (from Task 1).

---

### Task 3: Implement Toggle Maintenance Mode Function

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx` (add new function after fetchMaintenanceSettings)

**Interfaces:**
- Consumes: `api`, `maintenanceSettings`, `fetchMaintenanceSettings`, `setMaintenanceLoading`, `setSuccess`, `setError`, `toast`, `confirmDialog`
- Produces: Calls POST /api/maintenance/toggle with { maintenanceMode: boolean, message: string, estimatedEnd: string }, then refreshes settings

- [ ] **Step 1: Write handleToggleMaintenance function**

```javascript
const handleToggleMaintenance = async () => {
  const newMode = !maintenanceSettings.maintenanceMode;
  const confirmMessage = newMode 
    ? 'Enable maintenance mode? This will block staff access to the system.' 
    : 'Disable maintenance mode? Staff will be able to access the system again.';
  
  if (await confirmDialog(confirmMessage, { 
    title: newMode ? 'Enable Maintenance Mode' : 'Disable Maintenance Mode', 
    danger: newMode, 
    confirmText: newMode ? 'Enable' : 'Disable' 
  })) {
    setMaintenanceLoading(true);
    try {
      await api.post('/maintenance/toggle', {
        maintenanceMode: newMode,
        message: maintenanceSettings.message,
        estimatedEnd: maintenanceSettings.estimatedEnd || null
      });
      setSuccess(`Maintenance mode ${newMode ? 'enabled' : 'disabled'} successfully`);
      toast.success(`Maintenance mode ${newMode ? 'enabled' : 'disabled'}`);
      fetchMaintenanceSettings();
    } catch (err) {
      const message = err.response?.data?.message || `Failed to ${newMode ? 'enable' : 'disable'} maintenance mode`;
      setError(message);
      toast.error(message);
      console.error(err);
    } finally {
      setMaintenanceLoading(false);
    }
  }
};
```

- [ ] **Step 2: Test toggle functionality**

Verify API call works and settings refresh.

---

### Task 4: Add Maintenance Settings Form (Message and Estimated End)

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx` (add new function for updating settings)

**Interfaces:**
- Consumes: `api`, `maintenanceSettings`, `setMaintenanceSettings`, `setMaintenanceLoading`, `setSuccess`, `setError`, `toast`
- Produces: Updates maintenance message and estimated end via POST /api/maintenance/toggle (or new endpoint if needed)

- [ ] **Step 1: Write handleUpdateMaintenanceSettings function**

```javascript
const handleUpdateMaintenanceSettings = async (e) => {
  e.preventDefault();
  setMaintenanceLoading(true);
  try {
    await api.post('/maintenance/toggle', {
      maintenanceMode: maintenanceSettings.maintenanceMode,
      message: maintenanceSettings.message,
      estimatedEnd: maintenanceSettings.estimatedEnd || null
    });
    setSuccess('Maintenance settings updated successfully');
    toast.success('Settings updated');
  } catch (err) {
    const message = err.response?.data?.message || 'Failed to update maintenance settings';
    setError(message);
    toast.error(message);
    console.error(err);
  } finally {
    setMaintenanceLoading(false);
  }
};
```

- [ ] **Step 2: Add form inputs in maintenance tab content**

Add textarea for message and datetime-local input for estimatedEnd, bound to maintenanceSettings state.

---

### Task 5: Render Maintenance Tab Content

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx` (add new tab content block after MFA tab, around line 1477)

**Interfaces:**
- Consumes: `maintenanceSettings`, `maintenanceLoading`, `handleToggleMaintenance`, `handleUpdateMaintenanceSettings`, `loading` (global)
- Produces: JSX for maintenance tab with status display, toggle button, settings form

- [ ] **Step 1: Add maintenance tab content block**

```jsx
{activeTab === 'maintenance' && (
  <div>
    <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="w-full sm:w-auto flex-1">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-100">
          Maintenance Mode
        </h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Control system maintenance mode. When enabled, staff users cannot access the system.
        </p>
      </div>
    </div>

    {/* Status Card */}
    <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Current Status</h3>
        <span className={`px-3 py-1 text-sm font-medium rounded-full ${
          maintenanceSettings.maintenanceMode 
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' 
            : 'bg-green-100 text-green-700 dark:bg-emerald-500/20 dark:text-emerald-400'
        }`}>
          {maintenanceSettings.maintenanceMode ? 'MAINTENANCE MODE ACTIVE' : 'NORMAL OPERATION'}
        </span>
      </div>
      
      {maintenanceSettings.message && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Maintenance Message</p>
          <p className="text-gray-600 dark:text-slate-400">{maintenanceSettings.message}</p>
        </div>
      )}
      
      {maintenanceSettings.estimatedEnd && (
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <Clock className="w-5 h-5" />
          <span className="font-medium">
            Estimated completion: {new Date(maintenanceSettings.estimatedEnd).toLocaleString()}
          </span>
        </div>
      )}
    </div>

    {/* Toggle Button */}
    <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Toggle Maintenance Mode</h3>
      <button
        onClick={handleToggleMaintenance}
        disabled={maintenanceLoading}
        className={`flex items-center justify-center space-x-2 px-6 py-3 rounded-lg transition-colors touch-manipulation min-h-[44px] min-w-[200px] ${
          maintenanceSettings.maintenanceMode
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-green-500 hover:bg-green-600 text-white'
        } disabled:opacity-50`}
      >
        <Wrench className="w-5 h-5" />
        <span className="font-medium">
          {maintenanceLoading ? 'Updating...' : maintenanceSettings.maintenanceMode ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
        </span>
      </button>
      <p className="text-sm text-gray-500 dark:text-slate-400 mt-2 text-center">
        {maintenanceSettings.maintenanceMode 
          ? 'Staff users will be blocked from accessing the system. Admins can still log in.' 
          : 'Staff users will be able to access the system normally.'}
      </p>
    </div>

    {/* Settings Form */}
    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Maintenance Settings</h3>
      <form onSubmit={handleUpdateMaintenanceSettings} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
            Maintenance Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={maintenanceSettings.message}
            onChange={(e) => setMaintenanceSettings(prev => ({ ...prev, message: e.target.value }))}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 dark:border-slate-600 dark:placeholder-slate-500 touch-manipulation min-h-[44px] text-base"
            placeholder="Enter a message to display to users during maintenance..."
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
            Estimated End Time (Optional)
          </label>
          <input
            type="datetime-local"
            value={maintenanceSettings.estimatedEnd ? new Date(maintenanceSettings.estimatedEnd).toISOString().slice(0, 16) : ''}
            onChange={(e) => setMaintenanceSettings(prev => ({ ...prev, estimatedEnd: e.target.value ? new Date(e.target.value).toISOString() : '' }))}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 dark:border-slate-600 dark:placeholder-slate-500 touch-manipulation min-h-[44px] text-base"
          />
        </div>
        <button
          type="submit"
          disabled={maintenanceLoading}
          className="flex items-center justify-center space-x-2 px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 touch-manipulation min-h-[44px] transition-colors"
        >
          <span>Save Settings</span>
        </button>
      </form>
    </div>
  </div>
)}
```

- [ ] **Step 2: Import Clock icon**

Add `Clock` to the lucide-react import statement.

---

### Task 6: Test and Verify

**Files:**
- Test: Manual testing via browser

**Interfaces:**
- Consumes: Running frontend and backend servers
- Produces: Verified working maintenance mode toggle

- [ ] **Step 1: Start backend server**

```bash
cd backend && npm run dev
```

- [ ] **Step 2: Start frontend dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Login as admin and navigate to AdminPanel**

- [ ] **Step 4: Click Maintenance tab**

- [ ] **Step 5: Verify current status displays correctly**

- [ ] **Step 6: Enter maintenance message and estimated end time**

- [ ] **Step 7: Click "Enable Maintenance Mode" and confirm**

- [ ] **Step 8: Verify status changes to "MAINTENANCE MODE ACTIVE"**

- [ ] **Step 9: Verify non-admin users see maintenance page (test in incognito)**

- [ ] **Step 10: Click "Disable Maintenance Mode" and confirm**

- [ ] **Step 11: Verify status returns to "NORMAL OPERATION"**

---

### Task 7: Commit Changes

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx`

**Interfaces:**
- Produces: Git commit with all changes

- [ ] **Step 1: Stage changes**

```bash
git add frontend/src/pages/AdminPanel.jsx
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add maintenance mode toggle to AdminPanel"
```

---