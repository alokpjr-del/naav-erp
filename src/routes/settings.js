const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM settings`, (err, rows) => {
        let settings = {};
        rows.forEach(r => { settings[r.key] = r.value; });
        res.json(settings);
    });
});

router.post('/', (req, res) => {
    const { key, value } = req.body;
    db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value], () => {
        res.json({ success: true });
    });
});

module.exports = router;
