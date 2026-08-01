const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM restaurants ORDER BY name`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

router.post('/', (req, res) => {
    const restaurant = req.body || {};
    db.run(`INSERT OR REPLACE INTO restaurants (id, name, contactPerson, mobile, altMobile, address, gst, email, openTime, closeTime, status, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
    ], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: restaurant.id });
    });
});

router.put('/:id', (req, res) => {
    const restaurant = req.body || {};
    db.run(`UPDATE restaurants SET name = ?, contactPerson = ?, mobile = ?, altMobile = ?, address = ?, gst = ?, email = ?, openTime = ?, closeTime = ?, status = ?, remarks = ? WHERE id = ?`, [
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
    ], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

router.delete('/:id', (req, res) => {
    db.run(`DELETE FROM restaurants WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

module.exports = router;