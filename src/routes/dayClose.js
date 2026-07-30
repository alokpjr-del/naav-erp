const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM dayCloseHistory`, (err, rows) => { res.json(rows); });
});

router.post('/', (req, res) => {
    const h = req.body;
    db.run(`INSERT OR REPLACE INTO dayCloseHistory (date, totalOrders, totalSales, totalProfit, totalExpenses, netProfit, closedBy, closedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [h.date, h.totalOrders, h.totalSales, h.totalProfit, h.totalExpenses, h.netProfit, h.closedBy, h.closedAt],
        () => { res.json({ success: true }); }
    );
});

module.exports = router;
