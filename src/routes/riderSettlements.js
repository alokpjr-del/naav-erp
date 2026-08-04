const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

// Get All Rider Settlements
router.get('/', async (req, res) => {
    try {

        const result = await pool.query(
            `SELECT * FROM riderSettlements ORDER BY date DESC`
        );

        res.json(result.rows);

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
});

// Add / Update Rider Settlement
router.post('/', async (req, res) => {

    const s = req.body || {};

    try {

        await pool.query(
            `INSERT INTO riderSettlements (
                id,
                rider,
                from_date,
                to_date,
                orders,
                earnings,
                bonus,
                fine,
                advance,
                netPayable,
                mode,
                date,
                status,
                remarks,
                settledOrderIds
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
            )
            ON CONFLICT (id)
            DO UPDATE SET
                rider = EXCLUDED.rider,
                from_date = EXCLUDED.from_date,
                to_date = EXCLUDED.to_date,
                orders = EXCLUDED.orders,
                earnings = EXCLUDED.earnings,
                bonus = EXCLUDED.bonus,
                fine = EXCLUDED.fine,
                advance = EXCLUDED.advance,
                netPayable = EXCLUDED.netPayable,
                mode = EXCLUDED.mode,
                date = EXCLUDED.date,
                status = EXCLUDED.status,
                remarks = EXCLUDED.remarks,
                settledOrderIds = EXCLUDED.settledOrderIds`,
            [
                s.id,
                s.rider,
                s.from,
                s.to,
                s.orders,
                s.earnings,
                s.bonus,
                s.fine,
                s.advance,
                s.netPayable,
                s.mode,
                s.date,
                s.status,
                s.remarks,
                JSON.stringify(s.settledOrderIds || [])
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

// Delete Rider Settlement
router.delete('/:id', async (req, res) => {

    try {

        const result = await pool.query(
            `DELETE FROM riderSettlements WHERE id=$1`,
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