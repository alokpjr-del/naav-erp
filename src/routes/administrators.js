// src/routes/administrators.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../postgres');

router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM administrators ORDER BY "fullName"');
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const admin = req.body || {};
    try {
        let hashedPassword = admin.password;
        
        if (!hashedPassword) {
            const existing = await pool.query('SELECT password FROM administrators WHERE id = $1', [admin.id]);
            if (existing.rows.length > 0) {
                hashedPassword = existing.rows[0].password;
            }
        } else if (!hashedPassword.startsWith('$2a$') && !hashedPassword.startsWith('$2b$')) {
            hashedPassword = await bcrypt.hash(hashedPassword, 10);
        }

        await pool.query(
            `INSERT INTO administrators (id, "fullName", username, password, mobile, email, role, status, "createdDate", "modifiedDate", "lastLogin", "lastLogout", "createdBy", remarks) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
             ON CONFLICT (id) DO UPDATE SET 
             "fullName" = EXCLUDED."fullName", username = EXCLUDED.username, password = EXCLUDED.password, 
             mobile = EXCLUDED.mobile, email = EXCLUDED.email, role = EXCLUDED.role, status = EXCLUDED.status, 
             "createdDate" = EXCLUDED."createdDate", "modifiedDate" = EXCLUDED."modifiedDate", "lastLogin" = EXCLUDED."lastLogin", 
             "lastLogout" = EXCLUDED."lastLogout", "createdBy" = EXCLUDED."createdBy", remarks = EXCLUDED.remarks`,
            [
                admin.id,
                admin.fullName,
                admin.username,
                hashedPassword,
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
            ]
        );
        res.json({ success: true, id: admin.id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM administrators WHERE id = $1', [req.params.id]);
        res.json({ success: true, changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;