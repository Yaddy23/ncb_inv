const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { roleBasedLimiter } = require('../middleware/rateLimit');
const { getReservations, expireStale, releaseItem } = require('../controllers/reservationController');

router.use(protect);
router.use(roleBasedLimiter);

router.get('/', admin, getReservations);
router.post('/expire-stale', admin, expireStale);
router.post('/release-item', releaseItem);

module.exports = router;
