const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

// NOTE ON IDENTIFIER QUOTING:
// src/postgres-schema.js creates contactPerson/altMobile/openTime/closeTime
// as double-quoted, case-sensitive columns. Every reference to them below is
// double-quoted to match. Without the quotes, Postgres folds them to all
// lowercase and the column can't be found — see src/routes/state.js for the
// full explanation. This route currently isn't called by index.html (the
// frontend saves restaurants through the /api/state snapshot endpoint
// instead), but it's fixed here too so it's safe to use directly and so it
// doesn't silently reintroduce the same bug if it's wired up later.

// Get All Restaurants
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM restaurants ORDER BY name`
        );

        res.json(result.rows || []);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

// Add / Update Restaurant
router.post('/', async (req, res) => {

    const restaurant = req.body || {};

    // "restaurants".id is TEXT PRIMARY KEY (NOT NULL). Without this check,
    // a request missing id/name would hit the DB and fail with a raw
    // "null value in column ... violates not-null constraint" — the exact
    // failure class already seen in production for auditLog.id. Returning
    // a clear 400 here is strictly safer and doesn't change behavior for
    // any well-formed request.
    if (!restaurant.id || !restaurant.name) {
        return res.status(400).json({ error: 'id and name are required' });
    }

    try {

        await pool.query(
            `INSERT INTO restaurants (
                id,
                name,
                "contactPerson",
                mobile,
                "altMobile",
                address,
                gst,
                email,
                "openTime",
                "closeTime",
                status,
                remarks
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                "contactPerson" = EXCLUDED."contactPerson",
                mobile = EXCLUDED.mobile,
                "altMobile" = EXCLUDED."altMobile",
                address = EXCLUDED.address,
                gst = EXCLUDED.gst,
                email = EXCLUDED.email,
                "openTime" = EXCLUDED."openTime",
                "closeTime" = EXCLUDED."closeTime",
                status = EXCLUDED.status,
                remarks = EXCLUDED.remarks`,
            [
                restaurant.id,
                restaurant.name,
                restaurant.contactPerson,
                restaurant.mobile,
                restaurant.altMobile,
                restaurant.address,
                restaurant.gst,
                restaurant.email,
                restaurant.openTime,
                restaurant.closeTime,
                restaurant.status,
                restaurant.remarks
            ]
        );

        res.json({
            success: true,
            id: restaurant.id
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});

// Update Restaurant
router.put('/:id', async (req, res) => {

    const restaurant = req.body || {};

    if (!restaurant.name) {
        return res.status(400).json({ error: 'name is required' });
    }

    try {

        const result = await pool.query(
            `UPDATE restaurants
             SET
                name=$1,
                "contactPerson"=$2,
                mobile=$3,
                "altMobile"=$4,
                address=$5,
                gst=$6,
                email=$7,
                "openTime"=$8,
                "closeTime"=$9,
                status=$10,
                remarks=$11
             WHERE id=$12`,
            [
                restaurant.name,
                restaurant.contactPerson,
                restaurant.mobile,
                restaurant.altMobile,
                restaurant.address,
                restaurant.gst,
                restaurant.email,
                restaurant.openTime,
                restaurant.closeTime,
                restaurant.status,
                restaurant.remarks,
                req.params.id
            ]
        );

        res.json({
            success: true,
            changes: result.rowCount
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});

// Delete Restaurant
router.delete('/:id', async (req, res) => {

    try {

        const result = await pool.query(
            `DELETE FROM restaurants WHERE id=$1`,
            [req.params.id]
        );

        res.json({
            success: true,
            changes: result.rowCount
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});

module.exports = router;
