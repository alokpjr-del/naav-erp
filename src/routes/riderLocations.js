const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../postgres');

// Active authenticated rider sessions: token -> { riderId, riderName, mobile, loginTime }
const riderSessions = new Map();

// Latest location store: riderId -> { riderId, riderName, latitude, longitude, accuracy, timestamp, updatedAt }
const riderLocationsStore = new Map();

// Helper to extract session token from request headers
function getRiderToken(req) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    return (req.headers['x-rider-token'] || req.query.token || '').trim();
}

// POST /api/rider-login - Authenticate Rider
router.post('/rider-login', async (req, res) => {
    try {
        const { riderId, password } = req.body || {};
        const cleanId = String(riderId || '').trim();
        const cleanPass = String(password || '').trim();

        if (!cleanId || !cleanPass) {
            return res.status(400).json({ success: false, error: 'Rider ID/Mobile and Password are required.' });
        }

        const cleanMobile = cleanId.replace(/[^0-9]/g, '');

        // Query rider from PostgreSQL deliveryBoys table with case-insensitive matching
        const result = await pool.query(
            `SELECT * FROM "deliveryBoys" WHERE LOWER(id) = LOWER($1) OR (mobile IS NOT NULL AND mobile = $1) OR (mobile IS NOT NULL AND $2 != '' AND mobile = $2) OR LOWER(name) = LOWER($1)`,
            [cleanId, cleanMobile]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid Rider ID/Mobile or Password' });
        }

        const rider = result.rows[0];

        if (rider.status === 'Inactive') {
            return res.status(403).json({ success: false, error: 'Your rider account is inactive. Please contact NAAV Admin.' });
        }

        if (!rider.passwordHash) {
            return res.status(401).json({ success: false, error: 'Password not set. Please ask NAAV Admin to set your rider password.' });
        }

        const match = bcrypt.compareSync(cleanPass, rider.passwordHash);
        if (!match) {
            return res.status(401).json({ success: false, error: 'Invalid Rider ID/Mobile or Password' });
        }

        // Session Token Generation
        const token = crypto.randomBytes(32).toString('hex');
        const sessionData = {
            riderId: rider.id,
            riderName: rider.name,
            mobile: rider.mobile || '',
            loginTime: Date.now()
        };

        riderSessions.set(token, sessionData);

        res.json({
            success: true,
            token,
            rider: {
                id: rider.id,
                name: rider.name,
                mobile: rider.mobile || ''
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-session - Verify current session
router.get('/rider-session', (req, res) => {
    try {
        const token = getRiderToken(req);
        if (!token || !riderSessions.has(token)) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session.' });
        }

        const session = riderSessions.get(token);
        res.json({
            success: true,
            rider: {
                id: session.riderId,
                name: session.riderName,
                mobile: session.mobile
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-logout - Logout rider & invalidate session
router.post('/rider-logout', (req, res) => {
    try {
        const token = getRiderToken(req);
        if (token && riderSessions.has(token)) {
            riderSessions.delete(token);
        }
        res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-location - Update GPS Location (STRICT SESSION AUTHENTICATED)
router.post('/rider-location', (req, res) => {
    try {
        const token = getRiderToken(req);
        if (!token || !riderSessions.has(token)) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session. Please login first.' });
        }

        const session = riderSessions.get(token);
        const { latitude, longitude, accuracy, timestamp } = req.body || {};

        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, error: 'latitude and longitude are required.' });
        }

        const nowIso = new Date().toISOString();
        
        // STRICT SECURITY: Use session riderId & riderName ONLY (cannot spoof another rider!)
        const updatedRecord = {
            riderId: session.riderId,
            riderName: session.riderName,
            latitude: Number(latitude),
            longitude: Number(longitude),
            accuracy: Number(accuracy || 0),
            timestamp: timestamp || nowIso,
            updatedAt: nowIso
        };

        riderLocationsStore.set(session.riderId, updatedRecord);

        res.json({ success: true, data: updatedRecord });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-locations - Get latest locations for Accounts Live Map
router.get('/rider-locations', (req, res) => {
    try {
        const locations = [];
        const now = Date.now();
        const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

        for (const record of riderLocationsStore.values()) {
            const lastTime = new Date(record.timestamp || record.updatedAt).getTime();
            const diffMs = Math.max(0, now - lastTime);
            const isOnline = diffMs <= ONLINE_THRESHOLD_MS;
            const minsAgo = Math.floor(diffMs / (60 * 1000));

            locations.push({
                ...record,
                status: isOnline ? 'Online' : 'Offline',
                isOnline,
                lastSeen: isOnline ? 'Online now' : (minsAgo < 1 ? 'Just now' : `${minsAgo} min ago`)
            });
        }

        res.json(locations);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
