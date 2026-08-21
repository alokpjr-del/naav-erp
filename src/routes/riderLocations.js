const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { pool } = require('../postgres');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');
const REVOKED_TOKENS_FILE = path.join(BACKUP_DIR, 'rider_revoked_tokens.json');
const SECRET_KEY_FILE = path.join(BACKUP_DIR, 'rider_jwt_secret.key');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
}

// Resolution for Production Session Secret (No hardcoded fallback secret in source code)
function getJwtSecret() {
    const envSecret = process.env.RIDER_SESSION_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET;
    if (envSecret && envSecret.trim()) {
        return envSecret.trim();
    }

    // Dynamic key resolution for environment without explicit secret env var
    try {
        if (fs.existsSync(SECRET_KEY_FILE)) {
            const key = fs.readFileSync(SECRET_KEY_FILE, 'utf8').trim();
            if (key) return key;
        }
    } catch (e) {}

    const generatedKey = crypto.randomBytes(64).toString('hex');
    try {
        fs.writeFileSync(SECRET_KEY_FILE, generatedKey, 'utf8');
    } catch (e) {}
    return generatedKey;
}

const JWT_SECRET = getJwtSecret();

// Active authenticated rider sessions: token -> { riderId, riderName, mobile, loginTime }
const riderSessions = new Map();

// Latest location & heartbeat store: riderId -> { riderId, riderName, latitude, longitude, accuracy, lastLocationAt, lastHeartbeatAt, gpsStatus, isLoggedOut, updatedAt }
const riderLocationsStore = new Map();

// Persistent Revoked Tokens Store (Survives server restarts)
const revokedTokensSet = new Set();

function loadRevokedTokens() {
    try {
        if (fs.existsSync(REVOKED_TOKENS_FILE)) {
            const data = fs.readFileSync(REVOKED_TOKENS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                parsed.forEach(t => revokedTokensSet.add(t));
            }
        }
    } catch (e) {}
}

function saveRevokedTokens() {
    try {
        const arr = Array.from(revokedTokensSet).slice(-1000); // Keep last 1000 revoked tokens
        fs.writeFileSync(REVOKED_TOKENS_FILE, JSON.stringify(arr, null, 2), 'utf8');
    } catch (e) {}
}

loadRevokedTokens();

// --- HMAC-SHA256 JWT HELPERS ---
function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
}

function generateRiderJwt(payload, expiresInDays = 30) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
        ...payload,
        iat: now,
        exp: now + (expiresInDays * 24 * 60 * 60)
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function verifyRiderJwt(token) {
    if (!token || typeof token !== 'string') return null;
    if (revokedTokensSet.has(token)) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;

    const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

    if (signature !== expectedSignature) {
        return null;
    }

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return null;
        }
        return payload;
    } catch (e) {
        return null;
    }
}

// Helper to extract session token from request headers
function getRiderToken(req) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    return (req.headers['x-rider-token'] || req.query.token || '').trim();
}

// Helper to resolve session (memory fast-path + stateless JWT fallback post-restart + revocation check)
async function getAuthenticatedRiderSession(req) {
    const token = getRiderToken(req);
    if (!token) return null;

    // Check revocation store
    if (revokedTokensSet.has(token)) {
        riderSessions.delete(token);
        return null;
    }

    // Fast-path in-memory check
    if (riderSessions.has(token)) {
        return riderSessions.get(token);
    }

    // Stateless verification post server restart / redeploy
    const decoded = await verifyRiderJwt(token);
    if (!decoded || !decoded.riderId) return null;

    // Check if rider account is still active in PostgreSQL
    try {
        const result = await pool.query(
            `SELECT id, name, mobile, status FROM "deliveryBoys" WHERE id = $1`,
            [decoded.riderId]
        );

        if (result.rows.length === 0 || result.rows[0].status === 'Inactive') {
            revokedTokensSet.add(token);
            saveRevokedTokens();
            return null;
        }

        const rider = result.rows[0];
        const sessionData = {
            riderId: rider.id,
            riderName: rider.name,
            mobile: rider.mobile || '',
            loginTime: (decoded.iat || Math.floor(Date.now() / 1000)) * 1000
        };

        // Re-hydrate in-memory session map
        riderSessions.set(token, sessionData);
        return sessionData;
    } catch (e) {
        const sessionData = {
            riderId: decoded.riderId,
            riderName: decoded.riderName,
            mobile: decoded.mobile || '',
            loginTime: (decoded.iat || Math.floor(Date.now() / 1000)) * 1000
        };
        riderSessions.set(token, sessionData);
        return sessionData;
    }
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

        // Signed JWT Token Generation (Valid 30 Days)
        const token = generateRiderJwt({
            riderId: rider.id,
            riderName: rider.name,
            mobile: rider.mobile || ''
        }, 30);

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
router.get('/rider-session', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session.', code: 'SESSION_REVOKED' });
        }

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

// POST /api/rider-logout - Logout rider & invalidate session (PERSISTENT REVOCATION)
router.post('/rider-logout', async (req, res) => {
    try {
        const token = getRiderToken(req);
        const session = await getAuthenticatedRiderSession(req);

        if (session && session.riderId) {
            const existing = riderLocationsStore.get(session.riderId) || {};
            riderLocationsStore.set(session.riderId, {
                ...existing,
                isLoggedOut: true,
                updatedAt: new Date().toISOString()
            });
        }

        if (token) {
            riderSessions.delete(token);
            revokedTokensSet.add(token);
            saveRevokedTokens();
        }

        res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-location - Update GPS Location (STRICT SESSION AUTHENTICATED)
router.post('/rider-location', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session. Please login first.', code: 'SESSION_REVOKED' });
        }

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

        // ALSO insert historical GPS record into rider_location_history
        try {
            await pool.query(
                `INSERT INTO rider_location_history (rider_id, latitude, longitude, accuracy, recorded_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    session.riderId,
                    Number(latitude),
                    Number(longitude),
                    Number(accuracy || 0),
                    timestamp ? new Date(timestamp) : new Date()
                ]
            );
        } catch (dbErr) {
            console.error('Error inserting into rider_location_history:', dbErr);
        }

        res.json({ success: true, data: updatedRecord });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Haversine distance helper function (returns KM)
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// GET /api/rider-location-history - Get historical GPS points & route analytics
router.get('/rider-location-history', async (req, res) => {
    try {
        const { riderId, date } = req.query || {};

        if (!riderId) {
            return res.status(400).json({ success: false, error: 'riderId query parameter is required.' });
        }

        const queryDate = (date && date.trim()) ? date.trim() : new Date().toISOString().split('T')[0];

        const result = await pool.query(
            `SELECT id, rider_id, latitude, longitude, accuracy, recorded_at
             FROM rider_location_history
             WHERE rider_id = $1 AND recorded_at::date = $2::date
             ORDER BY recorded_at ASC`,
            [riderId, queryDate]
        );

        const locations = result.rows.map(row => ({
            id: row.id,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            accuracy: Number(row.accuracy || 0),
            recordedAt: row.recorded_at
        }));

        let totalDistanceKm = 0;
        for (let i = 1; i < locations.length; i++) {
            const prev = locations[i - 1];
            const curr = locations[i];
            const dist = calculateHaversineDistanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
            const timeDiffSec = (new Date(curr.recordedAt) - new Date(prev.recordedAt)) / 1000;

            // Outlier filter: Ignore sudden unrealistic GPS teleports (> 5km jump in < 15s or speed > 150 km/h)
            if (dist > 0.001) {
                const speedKmH = timeDiffSec > 0 ? (dist / (timeDiffSec / 3600)) : 0;
                if (speedKmH <= 150 && dist <= 5) {
                    totalDistanceKm += dist;
                }
            }
        }

        res.json({
            success: true,
            riderId,
            date: queryDate,
            totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
            pointCount: locations.length,
            locations
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-heartbeat - Lightweight Heartbeat Ping (STRICT SESSION AUTHENTICATED)
router.post('/rider-heartbeat', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session. Please login first.', code: 'SESSION_REVOKED' });
        }

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
module.exports.getAuthenticatedRiderSession = getAuthenticatedRiderSession;
module.exports.generateRiderJwt = generateRiderJwt;
