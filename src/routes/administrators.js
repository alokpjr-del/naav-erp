const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM administrators ORDER BY fullName`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

router.post('/', (req, res) => {
    const admin = req.body || {};
    db.run(`INSERT OR REPLACE INTO administrators (id, fullName, username, password, mobile, email, role, status, createdDate, modifiedDate, lastLogin, lastLogout, createdBy, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        admin.id,
        admin.fullName,
        admin.username,
        admin.password,
        admin.mobile,
        admin.email,
        admin.role,
        admin.status,
        admin.createdDate,
        admin.modifiedDate,
        admin.lastLogin,
        admin.lastLogout,
        admin.createdBy,
        admin.remarks
    ], function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, id: admin.id });
    });
});

router.delete('/:id', (req, res) => {
    db.run(`DELETE FROM administrators WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

module.exports = router;