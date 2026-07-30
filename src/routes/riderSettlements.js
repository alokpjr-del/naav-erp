const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM riderSettlements`, (err, rows) => {
        res.json(rows);
    });
});

router.post('/', (req, res) => {
    const s = req.body;
    db.run(`INSERT OR REPLACE INTO riderSettlements (id, rider, from_date, to_date, orders, earnings, bonus, fine, advance, netPayable, mode, date, status, remarks, settledOrderIds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.rider, s.from, s.to, s.orders, s.earnings, s.bonus, s.fine, s.advance, s.netPayable, s.mode, s.date, s.status, s.remarks, JSON.stringify(s.settledOrderIds || [])],
        () => { res.json({ success: true }); }
    );
});

router.delete('/:id', (req, res) => {
    db.run(`DELETE FROM riderSettlements WHERE id = ?`, [req.params.id], () => { res.json({ success: true }); });
});

module.exports = router;
