const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

// Get All Expenses
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM expenses ORDER BY date DESC`
        );

        res.json(result.rows || []);

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// Add / Update Expense
router.post('/', async (req, res) => {

    const ex = req.body || {};

    try {

        await pool.query(
            `INSERT INTO expenses (
                id,
                expenseId,
                date,
                category,
                expenseName,
                amount,
                paymentMode,
                paidTo,
                refNo,
                remarks,
                createdBy,
                createdDateTime
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )
            ON CONFLICT (id)
            DO UPDATE SET
                expenseId = EXCLUDED.expenseId,
                date = EXCLUDED.date,
                category = EXCLUDED.category,
                expenseName = EXCLUDED.expenseName,
                amount = EXCLUDED.amount,
                paymentMode = EXCLUDED.paymentMode,
                paidTo = EXCLUDED.paidTo,
                refNo = EXCLUDED.refNo,
                remarks = EXCLUDED.remarks,
                createdBy = EXCLUDED.createdBy,
                createdDateTime = EXCLUDED.createdDateTime`,
            [
                ex.id,
                ex.expenseId,
                ex.date,
                ex.category,
                ex.expenseName,
                ex.amount,
                ex.paymentMode,
                ex.paidTo,
                ex.refNo,
                ex.remarks,
                ex.createdBy,
                ex.createdDateTime
            ]
        );

        await pool.query(`
            INSERT INTO counters(name,val)
            VALUES('expenseCounter',1)
            ON CONFLICT(name)
            DO UPDATE SET val = counters.val + 1
        `);

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

// Delete Expense
router.delete('/:id', async (req, res) => {

    try {

        const result = await pool.query(
            `DELETE FROM expenses WHERE id=$1`,
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