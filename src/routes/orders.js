const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

// Get All Orders
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM entries ORDER BY date DESC`
        );

        res.json(
            (result.rows || []).map(row => ({
                ...row,
                isSettled: Boolean(row.isSettled),
                timeline: row.timeline ? JSON.parse(row.timeline) : []
            }))
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add / Update Order
router.post('/', async (req, res) => {
    const entry = req.body || {};

    try {
        await pool.query(
            `INSERT INTO entries (
                id, orderId, date, customerName, customerMobile,
                customerAddress, vendor, vendorRate, location,
                category, onlineRate, percentage,
                deliveryCharge, profit, deliveryBoy,
                cash, upi, naavTransferred,
                orderStatus, isSettled,
                paidDate, paidTime, paidBy,
                remarks, timeline
            )
            VALUES (
                $1,$2,$3,$4,$5,
                $6,$7,$8,$9,
                $10,$11,$12,
                $13,$14,$15,
                $16,$17,$18,
                $19,$20,
                $21,$22,$23,
                $24,$25
            )
            ON CONFLICT (id)
            DO UPDATE SET
                orderId = EXCLUDED.orderId,
                date = EXCLUDED.date,
                customerName = EXCLUDED.customerName,
                customerMobile = EXCLUDED.customerMobile,
                customerAddress = EXCLUDED.customerAddress,
                vendor = EXCLUDED.vendor,
                vendorRate = EXCLUDED.vendorRate,
                location = EXCLUDED.location,
                category = EXCLUDED.category,
                onlineRate = EXCLUDED.onlineRate,
                percentage = EXCLUDED.percentage,
                deliveryCharge = EXCLUDED.deliveryCharge,
                profit = EXCLUDED.profit,
                deliveryBoy = EXCLUDED.deliveryBoy,
                cash = EXCLUDED.cash,
                upi = EXCLUDED.upi,
                naavTransferred = EXCLUDED.naavTransferred,
                orderStatus = EXCLUDED.orderStatus,
                isSettled = EXCLUDED.isSettled,
                paidDate = EXCLUDED.paidDate,
                paidTime = EXCLUDED.paidTime,
                paidBy = EXCLUDED.paidBy,
                remarks = EXCLUDED.remarks,
                timeline = EXCLUDED.timeline`,
            [
                entry.id,
                entry.orderId,
                entry.date,
                entry.customerName,
                entry.customerMobile,
                entry.customerAddress,
                entry.vendor,
                entry.vendorRate,
                entry.location,
                entry.category,
                entry.onlineRate,
                entry.percentage,
                entry.deliveryCharge,
                entry.profit,
                entry.deliveryBoy,
                entry.cash,
                entry.upi,
                entry.naavTransferred,
                entry.orderStatus || "Pending",
                entry.isSettled ? 1 : 0,
                entry.paidDate,
                entry.paidTime,
                entry.paidBy,
                entry.remarks,
                JSON.stringify(entry.timeline || [])
            ]
        );

        await pool.query(`
            INSERT INTO counters(name,val)
            VALUES('orderCounter',1)
            ON CONFLICT(name)
            DO UPDATE SET val=counters.val+1
        `);

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Order
router.delete('/:id', async (req, res) => {

    try {

        const check = await pool.query(
            `SELECT id FROM entries WHERE id=$1`,
            [req.params.id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({
                error: "Not found"
            });
        }

        await pool.query(
            `DELETE FROM entries WHERE id=$1`,
            [req.params.id]
        );

        res.json({
            success: true
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }

});

module.exports = router;