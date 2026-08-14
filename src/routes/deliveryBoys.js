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

// Add Delivery Boy
router.post('/', async (req, res) => {
    const d = req.body || {};
    const cleanMobile = d.mobile ? String(d.mobile).replace(/[^0-9]/g, '').trim() : '';

    if (cleanMobile && cleanMobile.length !== 10) {
        return res.status(400).json({ success: false, error: 'Mobile number must be a 10-digit number.' });
    }

    try {
        if (cleanMobile) {
            const dupCheck = await pool.query(
                `SELECT id, name FROM "deliveryBoys" WHERE mobile = $1 AND id != $2`,
                [cleanMobile, d.id]
            );
            if (dupCheck.rows.length > 0) {
                return res.status(400).json({ success: false, error: `Mobile number is already assigned to another rider (${dupCheck.rows[0].name}).` });
            }
        }

        await pool.query(
            `INSERT INTO "deliveryBoys" (id, name, mobile, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                mobile = EXCLUDED.mobile,
                status = EXCLUDED.status`,
            [
                d.id,
                d.name ? d.name.trim() : '',
                cleanMobile || null,
                d.status || 'Active'
            ]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/delivery-boys/:id - Edit Delivery Boy details (name, mobile, status)
router.put('/:id', async (req, res) => {
    const riderId = req.params.id;
    const { name, mobile, status } = req.body || {};

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Delivery Boy Name is required.' });
    }

    const cleanMobile = mobile ? String(mobile).replace(/[^0-9]/g, '').trim() : '';

    if (cleanMobile && cleanMobile.length !== 10) {
        return res.status(400).json({ success: false, error: 'Mobile number must be a 10-digit number.' });
    }

    try {
        if (cleanMobile) {
            const dupCheck = await pool.query(
                `SELECT id, name FROM "deliveryBoys" WHERE mobile = $1 AND id != $2`,
                [cleanMobile, riderId]
            );
            if (dupCheck.rows.length > 0) {
                return res.status(400).json({ success: false, error: `Mobile number is already assigned to another rider (${dupCheck.rows[0].name}).` });
            }
        }

        const result = await pool.query(
            `UPDATE "deliveryBoys" SET name = $1, mobile = $2, status = $3 WHERE id = $4`,
            [name.trim(), cleanMobile || null, status || 'Active', riderId]
        );

        res.json({ success: true, changes: result.rowCount });
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