const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM restaurants`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/', (req, res) => {
    const r = req.body;
    db.run(`INSERT OR REPLACE INTO restaurants (id, name, contactPerson, mobile, altMobile, address, gst, email, openTime, closeTime, status, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.name, r.contactPerson, r.mobile, r.altMobile, r.address, r.gst, r.email, r.openTime, r.closeTime, r.status, r.remarks],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

router.delete('/:id', (req, res) => {
    db.run(`DELETE FROM restaurants WHERE id = ?`, [req.params.id], () => {
        res.json({ success: true });
    });
});

module.exports = router;
