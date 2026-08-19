const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../postgres');

// Active authenticated rider sessions: token -> { riderId, riderName, mobile, loginTime }
const riderSessions = new Map();

// Latest location & heartbeat store: riderId -> { riderId, riderName, latitude, longitude, accuracy, lastLocationAt, lastHeartbeatAt, gpsStatus, isLoggedOut, updatedAt }
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

        // Mark rider active in location store on login
        const existing = riderLocationsStore.get(rider.id) || {};
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();

        riderLocationsStore.set(rider.id, {
            ...existing,
            riderId: rider.id,
            riderName: rider.name,
            lastHeartbeatAt: nowMs,
            isLoggedOut: false,
            updatedAt: nowIso
        });

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

        // Touch heartbeat on session verification
        const existing = riderLocationsStore.get(session.riderId) || {};
        const nowMs = Date.now();
        riderLocationsStore.set(session.riderId, {
            ...existing,
            riderId: session.riderId,
            riderName: session.riderName,
            lastHeartbeatAt: nowMs,
            isLoggedOut: false,
            updatedAt: new Date(nowMs).toISOString()
        });

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
            const session = riderSessions.get(token);
            if (session && session.riderId) {
                const existing = riderLocationsStore.get(session.riderId) || {};
                riderLocationsStore.set(session.riderId, {
                    ...existing,
                    isLoggedOut: true,
                    updatedAt: new Date().toISOString()
                });
            }
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
        const { latitude, longitude, accuracy, timestamp, gpsStatus } = req.body || {};

        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, error: 'latitude and longitude are required.' });
        }

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const existing = riderLocationsStore.get(session.riderId) || {};

        // STRICT SECURITY: Use session riderId & riderName ONLY
        const updatedRecord = {
            ...existing,
            riderId: session.riderId,
            riderName: session.riderName,
            latitude: Number(latitude),
            longitude: Number(longitude),
            accuracy: Number(accuracy || 0),
            lastLocationAt: nowMs,
            lastHeartbeatAt: nowMs,
            gpsStatus: gpsStatus || 'active',
            isLoggedOut: false,
            timestamp: timestamp || nowIso,
            updatedAt: nowIso
        };

        riderLocationsStore.set(session.riderId, updatedRecord);

        res.json({ success: true, data: updatedRecord });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-heartbeat - Lightweight Heartbeat Ping (STRICT SESSION AUTHENTICATED)
router.post('/rider-heartbeat', (req, res) => {
    try {
        const token = getRiderToken(req);
        if (!token || !riderSessions.has(token)) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session. Please login first.' });
        }

        const session = riderSessions.get(token);
        const { gpsStatus } = req.body || {};
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();

        const existing = riderLocationsStore.get(session.riderId) || {};
        const updatedRecord = {
            ...existing,
            riderId: session.riderId,
            riderName: session.riderName,
            lastHeartbeatAt: nowMs,
            gpsStatus: gpsStatus || existing.gpsStatus || 'active',
            isLoggedOut: false,
            updatedAt: nowIso
        };

        riderLocationsStore.set(session.riderId, updatedRecord);

        res.json({ success: true, message: 'Heartbeat received.', lastHeartbeatAt: nowIso });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-locations - Get latest locations for Accounts Live Map
router.get('/rider-locations', (req, res) => {
    try {
        const locations = [];
        const now = Date.now();

        // Status Threshold Rules:
        // < 2 minutes (120,000 ms): ONLINE
        // 2 - 5 minutes (300,000 ms): STALE / CONNECTION WEAK
        // > 5 minutes: OFFLINE
        const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
        const STALE_THRESHOLD_MS = 5 * 60 * 1000;

        for (const record of riderLocationsStore.values()) {
            const lastLocationMs = record.lastLocationAt || (record.timestamp ? new Date(record.timestamp).getTime() : (record.updatedAt ? new Date(record.updatedAt).getTime() : 0));
            const lastHeartbeatMs = record.lastHeartbeatAt || (record.updatedAt ? new Date(record.updatedAt).getTime() : 0);

            const lastActiveMs = Math.max(lastLocationMs, lastHeartbeatMs);
            const diffMs = Math.max(0, now - lastActiveMs);
            const minsAgo = Math.floor(diffMs / (60 * 1000));

            let statusState = 'OFFLINE';
            let isOnline = false;
            let lastSeen = 'Offline';

            if (record.isLoggedOut) {
                statusState = 'OFFLINE';
                isOnline = false;
                lastSeen = 'Logged out';
            } else if (diffMs < ONLINE_THRESHOLD_MS) {
                statusState = 'ONLINE';
                isOnline = true;
                lastSeen = 'Online now';
            } else if (diffMs <= STALE_THRESHOLD_MS) {
                statusState = 'STALE';
                isOnline = true;
                lastSeen = `${minsAgo} min ago (Weak Connection)`;
            } else {
                statusState = 'OFFLINE';
                isOnline = false;
                lastSeen = minsAgo < 1 ? 'Just now' : `${minsAgo} min ago`;
            }

            // Check for explicit GPS unavailable or denied status
            const gpsUnavailable = record.gpsStatus === 'unavailable' || record.gpsStatus === 'denied';

            locations.push({
                ...record,
                status: isOnline ? (statusState === 'STALE' ? 'Weak Connection' : 'Online') : 'Offline',
                statusState,
                isOnline,
                gpsUnavailable,
                lastSeen: (isOnline && gpsUnavailable) ? (record.gpsStatus === 'denied' ? 'GPS permission denied' : 'GPS unavailable') : lastSeen
            });
        }

        res.json(locations);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
