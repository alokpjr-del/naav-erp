// src/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../postgres');

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM administrators WHERE username = $1', [username]);
        const admin = result.rows[0];

        if (!admin) return res.status(401).json({ error: 'Invalid Username or Password' });

        const match = await bcrypt.compare(password, admin.password);
        if (!match) return res.status(401).json({ error: 'Invalid Username or Password' });

        if (admin.status !== 'Active') return res.status(403).json({ error: 'Account is inactive' });

        const now = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
        await pool.query('UPDATE administrators SET "lastLogin" = $1 WHERE id = $2', [now, admin.id]);
        
        res.json({ success: true, admin });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/logout', async (req, res) => {
    const { username } = req.body;
    const now = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
    try {
        await pool.query('UPDATE administrators SET "lastLogout" = $1 WHERE username = $2', [now, username]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;