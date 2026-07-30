const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM auditLog ORDER BY id DESC`, (err, rows) => { res.json(rows); });
});

router.post('/', (req, res) => {
    const l = req.body;
    db.run(`INSERT INTO auditLog (date, time, user, action, details) VALUES (?, ?, ?, ?, ?)`,
        [l.date, l.time, l.user, l.action, l.details],
        () => { res.json({ success: true }); }
    );
});

router.delete('/', (req, res) => {
    db.run(`DELETE FROM auditLog`, () => { res.json({ success: true }); });
});

module.exports = router;
