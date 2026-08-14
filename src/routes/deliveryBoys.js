const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');
const bcrypt = require('bcryptjs');

// Get All Delivery Boys
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, mobile, status, CASE WHEN "passwordHash" IS NOT NULL AND "passwordHash" != '' THEN true ELSE false END as "hasPassword" FROM "deliveryBoys" ORDER BY name`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add / Update Delivery Boy
router.post('/', async (req, res) => {
    const d = req.body || {};
    try {
        await pool.query(
            `INSERT INTO "deliveryBoys" (id, name, mobile, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                mobile = COALESCE(EXCLUDED.mobile, "deliveryBoys".mobile),
                status = COALESCE(EXCLUDED.status, "deliveryBoys".status)`,
            [
                d.id,
                d.name,
                d.mobile || null,
                d.status || 'Active'
            ]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Set / Reset Rider Password (Admin Action)
router.post('/set-password', async (req, res) => {
    const { riderId, password } = req.body || {};
    if (!riderId || !password) {
        return res.status(400).json({ success: false, error: 'riderId and password are required.' });
    }

    try {
        const hash = bcrypt.hashSync(String(password), 10);
        await pool.query(
            `UPDATE "deliveryBoys" SET "passwordHash" = $1 WHERE id = $2 OR name = $2`,
            [hash, String(riderId).trim()]
        );
        res.json({ success: true, message: 'Password set successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Toggle Rider Active / Inactive Status (Admin Action)
router.post('/toggle-status', async (req, res) => {
    const { riderId, status } = req.body || {};
    if (!riderId || !status) {
        return res.status(400).json({ success: false, error: 'riderId and status are required.' });
    }

    try {
        await pool.query(
            `UPDATE "deliveryBoys" SET status = $1 WHERE id = $2 OR name = $2`,
            [String(status).trim(), String(riderId).trim()]
        );
        res.json({ success: true, message: `Rider status updated to ${status}.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete Delivery Boy
router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM "deliveryBoys" WHERE id=$1`,
            [req.params.id]
        );
        res.json({ success: true, changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;