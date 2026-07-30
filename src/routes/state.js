const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
    try {
        db.all(`SELECT * FROM settings`, (err, settingsRows) => {
            let settings = { companyName: 'NAAV ACCOUNTS', customCategories: [], lastBackupDate: 'Never' };
            settingsRows.forEach(row => {
                if (row.key === 'customCategories') {
                    try { settings.customCategories = JSON.parse(row.value); } catch(e) { settings.customCategories = []; }
                } else {
                    settings[row.key] = row.value;
                }
            });

            db.all(`SELECT * FROM entries`, (err, entries) => {
                entries = entries.map(e => ({
                    ...e,
                    isSettled: Boolean(e.isSettled),
                    timeline: e.timeline ? JSON.parse(e.timeline) : []
                }));

                db.all(`SELECT * FROM expenses`, (err, expenses) => {
                    db.all(`SELECT * FROM recycleBin`, (err, recycleBin) => {
                        db.all(`SELECT * FROM restaurants`, (err, restaurants) => {
                            db.all(`SELECT * FROM deliveryBoys`, (err, deliveryBoys) => {
                                db.all(`SELECT * FROM customers`, (err, customers) => {
                                    db.all(`SELECT * FROM riderSettlements`, (err, riderSettlements) => {
                                        riderSettlements = riderSettlements.map(rs => ({
                                            ...rs,
                                            settledOrderIds: rs.settledOrderIds ? JSON.parse(rs.settledOrderIds) : []
                                        }));

                                        db.all(`SELECT * FROM restaurantSettlements`, (err, restaurantSettlements) => {
                                            db.all(`SELECT * FROM auditLog ORDER BY id DESC`, (err, auditLog) => {
                                                db.all(`SELECT * FROM administrators`, (err, administrators) => {
                                                    db.all(`SELECT * FROM dayCloseHistory`, (err, dayCloseHistory) => {
                                                        db.get(`SELECT val FROM counters WHERE name = 'orderCounter'`, (err, oc) => {
                                                            db.get(`SELECT val FROM counters WHERE name = 'expenseCounter'`, (err, ec) => {
                                                                res.json({
                                                                    settings,
                                                                    entries,
                                                                    expenses,
                                                                    recycleBin: recycleBin || [],
                                                                    restaurants,
                                                                    deliveryBoys,
                                                                    customers: customers || [],
                                                                    riderSettlements,
                                                                    restaurantSettlements,
                                                                    auditLog,
                                                                    administrators,
                                                                    dayCloseHistory: dayCloseHistory || [],
                                                                    orderCounter: oc ? oc.val : 1,
                                                                    expenseCounter: ec ? ec.val : 1
                                                                });
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
