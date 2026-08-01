const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM customers ORDER BY name`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

router.post('/', (req, res) => {
    const customer = req.body || {};
    db.run(`INSERT OR REPLACE INTO customers (id, name, mobile, address, email, remarks, createdDate) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        customer.id,
        customer.name,
        customer.mobile,
        customer.address,
        customer.email,
        customer.remarks,
        customer.createdDate || new Date().toISOString()
    ], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: customer.id });
    });
});

router.delete('/:id', (req, res) => {
    db.run(`DELETE FROM customers WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

module.exports = router;
