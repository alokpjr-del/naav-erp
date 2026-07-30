const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM entries`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/', (req, res) => {
    const entry = req.body;
    db.run(`INSERT OR REPLACE INTO entries (id, orderId, date, customerName, customerMobile, customerAddress, vendor, vendorRate, location, category, onlineRate, percentage, deliveryCharge, profit, deliveryBoy, cash, upi, naavTransferred, orderStatus, isSettled, paidDate, paidTime, paidBy, remarks, timeline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.id, entry.orderId, entry.date, entry.customerName, entry.customerMobile, entry.customerAddress, entry.vendor, entry.vendorRate, entry.location, entry.category, entry.onlineRate, entry.percentage, entry.deliveryCharge, entry.profit, entry.deliveryBoy, entry.cash, entry.upi, entry.naavTransferred, entry.orderStatus, entry.isSettled ? 1 : 0, entry.paidDate, entry.paidTime, entry.paidBy, entry.remarks, JSON.stringify(entry.timeline || [])],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`UPDATE counters SET val = val + 1 WHERE name = 'orderCounter'`, () => {
                res.json({ success: true });
            });
        }
    );
});

router.delete('/:id', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM entries WHERE id = ?`, [id], (err, row) => {
        if (row) {
            db.run(`DELETE FROM entries WHERE id = ?`, [id], () => {
                res.json({ success: true });
            });
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    });
});

module.exports = router;
