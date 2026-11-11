const SystemSettings = require('../models/SystemSettings');

// @desc    Get maintenance mode status (public endpoint)
// @route   GET /api/maintenance/status
// @access  Public
const getMaintenanceStatus = async (req, res) => {
  try {
    const maintenanceMode = await SystemSettings.getValue('maintenance_mode', false);
    const message = await SystemSettings.getValue('maintenance_message', 'System is under maintenance. Please check back later.');
    const estimatedEnd = await SystemSettings.getValue('maintenance_estimated_end', null);

    res.json({
      maintenanceMode,
      message,
      estimatedEnd
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle maintenance mode (Admin only)
// @route   POST /api/maintenance/toggle
// @access  Private/Admin
const toggleMaintenanceMode = async (req, res) => {
  try {
    const { maintenanceMode, message, estimatedEnd } = req.body;

    if (typeof maintenanceMode !== 'boolean') {
      return res.status(400).json({ message: 'maintenanceMode must be a boolean' });
    }

    await SystemSettings.setValue('maintenance_mode', maintenanceMode, 'Enable/disable maintenance mode');

    if (message !== undefined) {
      await SystemSettings.setValue('maintenance_message', message, 'Maintenance message shown to users');
    }

    if (estimatedEnd !== undefined) {
      await SystemSettings.setValue('maintenance_estimated_end', estimatedEnd, 'Estimated end time for maintenance');
    }

    const status = await SystemSettings.getValue('maintenance_mode', false);
    const msg = await SystemSettings.getValue('maintenance_message', 'System is under maintenance. Please check back later.');
    const end = await SystemSettings.getValue('maintenance_estimated_end', null);

    // Log admin action
    const UserLog = require('../models/UserLog');
    await UserLog.create({
      userId: req.user._id,
      action: maintenanceMode ? 'MAINTENANCE_ENABLE' : 'MAINTENANCE_DISABLE',
      details: `Maintenance mode ${maintenanceMode ? 'enabled' : 'disabled'}${message ? `: ${message}` : ''}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      maintenanceMode: status,
      message: msg,
      estimatedEnd: end,
      message: `Maintenance mode ${maintenanceMode ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get maintenance settings (Admin only)
// @route   GET /api/maintenance/settings
// @access  Private/Admin
const getMaintenanceSettings = async (req, res) => {
  try {
    const maintenanceMode = await SystemSettings.getValue('maintenance_mode', false);
    const message = await SystemSettings.getValue('maintenance_message', 'System is under maintenance. Please check back later.');
    const estimatedEnd = await SystemSettings.getValue('maintenance_estimated_end', null);

    res.json({
      maintenanceMode,
      message,
      estimatedEnd
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMaintenanceStatus,
  toggleMaintenanceMode,
  getMaintenanceSettings
};