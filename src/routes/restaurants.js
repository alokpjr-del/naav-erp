const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

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

    try {

        await pool.query(
            `INSERT INTO restaurants (
                id,
                name,
                contactPerson,
                mobile,
                altMobile,
                address,
                gst,
                email,
                openTime,
                closeTime,
                status,
                remarks
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                contactPerson = EXCLUDED.contactPerson,
                mobile = EXCLUDED.mobile,
                altMobile = EXCLUDED.altMobile,
                address = EXCLUDED.address,
                gst = EXCLUDED.gst,
                email = EXCLUDED.email,
                openTime = EXCLUDED.openTime,
                closeTime = EXCLUDED.closeTime,
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

    try {

        const result = await pool.query(
            `UPDATE restaurants
             SET
                name=$1,
                contactPerson=$2,
                mobile=$3,
                altMobile=$4,
                address=$5,
                gst=$6,
                email=$7,
                openTime=$8,
                closeTime=$9,
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