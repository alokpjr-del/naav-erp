const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM restaurantSettlements`, (err, rows) => { res.json(rows); });
});

router.post('/', (req, res) => {
    const s = req.body;
    db.run(`INSERT OR REPLACE INTO restaurantSettlements (id, vendor, from_date, to_date, orders, pendingAmount, paidAmount, outstandingAmount, mode, date, status, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.vendor, s.from, s.to, s.orders, s.pendingAmount, s.paidAmount, s.outstandingAmount, s.mode, s.date, s.status, s.remarks],
        () => { res.json({ success: true }); }
    );
});

router.delete('/:id', (req, res) => {
    db.run(`DELETE FROM restaurantSettlements WHERE id = ?`, [req.params.id], () => { res.json({ success: true }); });
});

module.exports = router;
