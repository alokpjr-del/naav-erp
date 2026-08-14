const express = require('express');
const router = express.Router();

// In-memory latest locations map (keyed by riderId)
// Format: { [riderId]: { riderId, riderName, latitude, longitude, accuracy, timestamp, updatedAt } }
const riderLocationsStore = new Map();

// POST /api/rider-location - Update rider location
router.post('/rider-location', (req, res) => {
    try {
        const { riderId, riderName, latitude, longitude, accuracy, timestamp } = req.body || {};

        if (!riderId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, error: 'riderId, latitude, and longitude are required.' });
        }

        const nowIso = new Date().toISOString();
        const updatedRecord = {
            riderId: String(riderId).trim(),
            riderName: (riderName || 'Rider').trim(),
            latitude: Number(latitude),
            longitude: Number(longitude),
            accuracy: Number(accuracy || 0),
            timestamp: timestamp || nowIso,
            updatedAt: nowIso
        };

        riderLocationsStore.set(updatedRecord.riderId, updatedRecord);

        res.json({ success: true, data: updatedRecord });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-locations - Get latest locations for all riders
router.get('/rider-locations', (req, res) => {
    try {
        const locations = [];
        const now = Date.now();

        // 3 minutes (180,000 ms) threshold for Online status
        const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

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
