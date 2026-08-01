const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM expenses ORDER BY date DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

router.post('/', (req, res) => {
    const ex = req.body || {};
    db.run(`INSERT OR REPLACE INTO expenses (id, expenseId, date, category, expenseName, amount, paymentMode, paidTo, refNo, remarks, createdBy, createdDateTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ex.id, ex.expenseId, ex.date, ex.category, ex.expenseName, ex.amount, ex.paymentMode, ex.paidTo, ex.refNo, ex.remarks, ex.createdBy, ex.createdDateTime],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT INTO counters (name, val) VALUES ('expenseCounter', 1) ON CONFLICT(name) DO UPDATE SET val = val + 1`, () => {
                res.json({ success: true });
            });
        }
    );
});

router.delete('/:id', (req, res) => {
    db.run(`DELETE FROM expenses WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

module.exports = router;
