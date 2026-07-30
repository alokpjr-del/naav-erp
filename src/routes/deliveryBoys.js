const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM deliveryBoys`, (err, rows) => { res.json(rows); });
});

router.post('/', (req, res) => {
    const d = req.body;
    db.run(`INSERT OR REPLACE INTO deliveryBoys (id, name) VALUES (?, ?)`, [d.id, d.name], () => { res.json({ success: true }); });
});

router.delete('/:id', (req, res) => {
    db.run(`DELETE FROM deliveryBoys WHERE id = ?`, [req.params.id], () => { res.json({ success: true }); });
});

module.exports = router;
