const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

// Get All Restaurant Settlements
router.get('/', async (req, res) => {
    try {

        const result = await pool.query(
            `SELECT * FROM restaurantSettlements
             ORDER BY date DESC, id DESC`
        );

        res.json(result.rows);

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
});

// Add / Update Restaurant Settlement
router.post('/', async (req, res) => {

    const s = req.body || {};

    try {

        await pool.query(
            `INSERT INTO restaurantSettlements (
                id,
                vendor,
                from_date,
                to_date,
                orders,
                pendingAmount,
                paidAmount,
                outstandingAmount,
                mode,
                date,
                status,
                remarks
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )
            ON CONFLICT (id)
            DO UPDATE SET
                vendor = EXCLUDED.vendor,
                from_date = EXCLUDED.from_date,
                to_date = EXCLUDED.to_date,
                orders = EXCLUDED.orders,
                pendingAmount = EXCLUDED.pendingAmount,
                paidAmount = EXCLUDED.paidAmount,
                outstandingAmount = EXCLUDED.outstandingAmount,
                mode = EXCLUDED.mode,
                date = EXCLUDED.date,
                status = EXCLUDED.status,
                remarks = EXCLUDED.remarks`,
            [
                s.id,
                s.vendor,
                s.from,
                s.to,
                s.orders,
                s.pendingAmount,
                s.paidAmount,
                s.outstandingAmount,
                s.mode,
                s.date,
                s.status,
                s.remarks
            ]
        );

        res.json({
            success: true
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

// Delete Restaurant Settlement
router.delete('/:id', async (req, res) => {

    try {

        const result = await pool.query(
            `DELETE FROM restaurantSettlements
             WHERE id = $1`,
            [req.params.id]
        );

        res.json({
            success: true,
            changes: result.rowCount
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

module.exports = router;