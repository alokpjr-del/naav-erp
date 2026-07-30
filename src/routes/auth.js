const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM administrators WHERE username = ? AND password = ?`, [username, password], (err, admin) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!admin) return res.status(401).json({ error: 'Invalid Username or Password' });
        if (admin.status !== 'Active') return res.status(403).json({ error: 'Account is inactive' });

        const now = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
        db.run(`UPDATE administrators SET lastLogin = ? WHERE id = ?`, [now, admin.id], () => {
            res.json({ success: true, admin });
        });
    });
});

router.post('/logout', (req, res) => {
    const { username } = req.body;
    const now = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
    db.run(`UPDATE administrators SET lastLogout = ? WHERE username = ?`, [now, username], () => {
        res.json({ success: true });
    });
});

module.exports = router;
