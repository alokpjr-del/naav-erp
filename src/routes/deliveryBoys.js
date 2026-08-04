const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

// Get All Delivery Boys
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM deliveryBoys ORDER BY name`
        );

        res.json(result.rows);

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// Add / Update Delivery Boy
router.post('/', async (req, res) => {

    const d = req.body || {};

    try {

        await pool.query(
            `INSERT INTO deliveryBoys (
                id,
                name
            )
            VALUES ($1,$2)
            ON CONFLICT (id)
            DO UPDATE
            SET
                name = EXCLUDED.name`,
            [
                d.id,
                d.name
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

// Delete Delivery Boy
router.delete('/:id', async (req, res) => {

    try {

        const result = await pool.query(
            `DELETE FROM deliveryBoys WHERE id=$1`,
            [
                req.params.id
            ]
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