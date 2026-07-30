const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all(`SELECT * FROM administrators`, (err, rows) => {
        res.json(rows);
    });
});

router.post('/', (req, res) => {
    const a = req.body;

    // DEBUG
    console.log("NEW ADMIN:", a);

    db.run(
        `INSERT OR REPLACE INTO administrators
        (id, fullName, username, password, mobile, email, role, status, createdDate, modifiedDate, lastLogin, lastLogout, createdBy, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            a.id,
            a.fullName,
            a.username,
            a.password,
            a.mobile,
            a.email,
            a.role,
            a.status,
            a.createdDate,
            a.modifiedDate,
            a.lastLogin,
            a.lastLogout,
            a.createdBy,
            a.remarks
        ],
        function (err) {
            if (err) {
                console.error("INSERT ERROR:", err);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }

            console.log("ADMIN SAVED SUCCESSFULLY");
            res.json({ success: true });
        }
    );
});

router.delete('/:id', (req, res) => {
    db.run(
        `DELETE FROM administrators WHERE id = ?`,
        [req.params.id],
        () => {
            res.json({ success: true });
        }
    );
});

module.exports = router;