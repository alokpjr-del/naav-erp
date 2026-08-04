const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

// Get All Customers
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM customers ORDER BY name`
        );

        res.json(result.rows || []);

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// Add / Update Customer
router.post('/', async (req, res) => {

    const customer = req.body || {};

    try {

        await pool.query(
            `INSERT INTO customers (
                id,
                name,
                mobile,
                address,
                email,
                remarks,
                createdDate
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7
            )
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                mobile = EXCLUDED.mobile,
                address = EXCLUDED.address,
                email = EXCLUDED.email,
                remarks = EXCLUDED.remarks`,
            [
                customer.id,
                customer.name,
                customer.mobile,
                customer.address,
                customer.email,
                customer.remarks,
                customer.createdDate || new Date().toISOString()
            ]
        );

        res.json({
            success: true,
            id: customer.id
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

// Delete Customer
router.delete('/:id', async (req, res) => {

    try {

        const result = await pool.query(
            `DELETE FROM customers WHERE id = $1`,
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