const express = require('express');
const router = express.Router();
const db = require('../db');

function runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function allSql(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function getSql(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function parseJson(value, fallback = []) {
    if (!value) return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    }
    return value;
}

async function saveSnapshot(snapshot) {
    const state = snapshot || {};
    const settings = state.settings || {};

    await runSql('DELETE FROM settings');
    await Promise.all(Object.entries(settings).map(([key, value]) => runSql(
        'INSERT INTO settings (key, value) VALUES (?, ?)',
        [key, typeof value === 'string' ? value : JSON.stringify(value)]
    )));

    await runSql('DELETE FROM entries');
    for (const entry of state.entries || []) {
        await runSql(`INSERT INTO entries (
            id, orderId, date, customerName, customerMobile, customerAddress, vendor, vendorRate, location, category, onlineRate, percentage, deliveryCharge, profit, deliveryBoy, cash, upi, naavTransferred, orderStatus, isSettled, paidDate, paidTime, paidBy, remarks, timeline
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            entry.id,
            entry.orderId,
            entry.date,
            entry.customerName,
            entry.customerMobile,
            entry.customerAddress,
            entry.vendor,
            entry.vendorRate,
            entry.location,
            entry.category,
            entry.onlineRate,
            entry.percentage,
            entry.deliveryCharge,
            entry.profit,
            entry.deliveryBoy,
            entry.cash,
            entry.upi,
            entry.naavTransferred,
            entry.orderStatus || 'Pending',
            entry.isSettled ? 1 : 0,
            entry.paidDate,
            entry.paidTime,
            entry.paidBy,
            entry.remarks,
            JSON.stringify(entry.timeline || [])
        ]);
    }

    await runSql('DELETE FROM expenses');
    for (const expense of state.expenses || []) {
        await runSql(`INSERT INTO expenses (id, expenseId, date, category, expenseName, amount, paymentMode, paidTo, refNo, remarks, createdBy, createdDateTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            expense.id, expense.expenseId, expense.date, expense.category, expense.expenseName, expense.amount, expense.paymentMode, expense.paidTo, expense.refNo, expense.remarks, expense.createdBy, expense.createdDateTime
        ]);
    }

    await runSql('DELETE FROM restaurants');
    for (const restaurant of state.restaurants || []) {
        await runSql(`INSERT INTO restaurants (id, name, contactPerson, mobile, altMobile, address, gst, email, openTime, closeTime, status, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            restaurant.id, restaurant.name, restaurant.contactPerson, restaurant.mobile, restaurant.altMobile, restaurant.address, restaurant.gst, restaurant.email, restaurant.openTime, restaurant.closeTime, restaurant.status, restaurant.remarks
        ]);
    }

    await runSql('DELETE FROM deliveryBoys');
    for (const boy of state.deliveryBoys || []) {
        await runSql(`INSERT INTO deliveryBoys (id, name) VALUES (?, ?)`, [boy.id, boy.name]);
    }

    await runSql('DELETE FROM customers');
    for (const customer of state.customers || []) {
        await runSql(`INSERT INTO customers (id, name, mobile, address, email, remarks, createdDate) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            customer.id, customer.name, customer.mobile, customer.address, customer.email, customer.remarks, customer.createdDate
        ]);
    }

    await runSql('DELETE FROM recycleBin');
    for (const item of state.recycleBin || []) {
        await runSql(`INSERT INTO recycleBin (id, type, data, deletedAt) VALUES (?, ?, ?, ?)`, [
            item.id, item.type, JSON.stringify(item.data || item), item.deletedAt
        ]);
    }

    await runSql('DELETE FROM riderSettlements');
    for (const settlement of state.riderSettlements || []) {
        await runSql(`INSERT INTO riderSettlements (id, rider, from_date, to_date, orders, earnings, bonus, fine, advance, netPayable, mode, date, status, remarks, settledOrderIds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            settlement.id, settlement.rider, settlement.from, settlement.to, settlement.orders, settlement.earnings, settlement.bonus, settlement.fine, settlement.advance, settlement.netPayable, settlement.mode, settlement.date, settlement.status, settlement.remarks, JSON.stringify(settlement.settledOrderIds || [])
        ]);
    }

    await runSql('DELETE FROM restaurantSettlements');
    for (const settlement of state.restaurantSettlements || []) {
        await runSql(`INSERT INTO restaurantSettlements (id, vendor, from_date, to_date, orders, pendingAmount, paidAmount, outstandingAmount, mode, date, status, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            settlement.id, settlement.vendor, settlement.from, settlement.to, settlement.orders, settlement.pendingAmount, settlement.paidAmount, settlement.outstandingAmount, settlement.mode, settlement.date, settlement.status, settlement.remarks
        ]);
    }

    await runSql('DELETE FROM auditLog');
    for (const log of state.auditLog || []) {
        await runSql(`INSERT INTO auditLog (id, date, time, user, action, details) VALUES (?, ?, ?, ?, ?, ?)`, [
            log.id || null, log.date, log.time, log.user, log.action, log.details
        ]);
    }

    await runSql('DELETE FROM administrators');
    for (const admin of state.administrators || []) {
        await runSql(`INSERT INTO administrators (id, fullName, username, password, mobile, email, role, status, createdDate, modifiedDate, lastLogin, lastLogout, createdBy, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            admin.id, admin.fullName, admin.username, admin.password, admin.mobile, admin.email, admin.role, admin.status, admin.createdDate, admin.modifiedDate, admin.lastLogin, admin.lastLogout, admin.createdBy, admin.remarks
        ]);
    }

    await runSql('DELETE FROM dayCloseHistory');
    for (const history of state.dayCloseHistory || []) {
        await runSql(`INSERT INTO dayCloseHistory (date, totalOrders, totalSales, totalProfit, totalExpenses, netProfit, closedBy, closedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            history.date, history.totalOrders, history.totalSales, history.totalProfit, history.totalExpenses, history.netProfit, history.closedBy, history.closedAt
        ]);
    }

    await runSql('DELETE FROM counters');
    await runSql(`INSERT INTO counters (name, val) VALUES ('orderCounter', ?)`, [Number(state.orderCounter || 1)]);
    await runSql(`INSERT INTO counters (name, val) VALUES ('expenseCounter', ?)`, [Number(state.expenseCounter || 1)]);
}

router.get('/', async (req, res) => {
    try {
        const settingsRows = await allSql('SELECT * FROM settings');
        const settings = { companyName: 'NAAV ACCOUNTS', customCategories: [], lastBackupDate: 'Never' };
        settingsRows.forEach((row) => {
            if (row.key === 'customCategories') {
                settings.customCategories = parseJson(row.value, []);
            } else {
                settings[row.key] = row.value;
            }
        });

        const entries = (await allSql('SELECT * FROM entries')).map((entry) => ({
            ...entry,
            isSettled: Boolean(entry.isSettled),
            timeline: parseJson(entry.timeline, [])
        }));

        const expenses = await allSql('SELECT * FROM expenses');
        const recycleBin = (await allSql('SELECT * FROM recycleBin')).map((item) => ({
            ...item,
            data: parseJson(item.data, {})
        }));
        const restaurants = await allSql('SELECT * FROM restaurants');
        const deliveryBoys = await allSql('SELECT * FROM deliveryBoys');
        const customers = await allSql('SELECT * FROM customers');
        const riderSettlements = (await allSql('SELECT * FROM riderSettlements')).map((entry) => ({
            ...entry,
            settledOrderIds: parseJson(entry.settledOrderIds, [])
        }));
        const restaurantSettlements = await allSql('SELECT * FROM restaurantSettlements ORDER BY date DESC, id DESC');
        const auditLog = await allSql('SELECT * FROM auditLog ORDER BY id DESC');
        const administrators = await allSql('SELECT * FROM administrators');
        const dayCloseHistory = await allSql('SELECT * FROM dayCloseHistory');
        const orderCounter = await getSql('SELECT val FROM counters WHERE name = ?', ['orderCounter']);
        const expenseCounter = await getSql('SELECT val FROM counters WHERE name = ?', ['expenseCounter']);

        res.json({
            settings,
            entries,
            expenses,
            recycleBin,
            restaurants,
            deliveryBoys,
            customers,
            riderSettlements,
            restaurantSettlements,
            auditLog,
            administrators,
            dayCloseHistory,
            orderCounter: orderCounter ? orderCounter.val : 1,
            expenseCounter: expenseCounter ? expenseCounter.val : 1
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        await saveSnapshot(req.body || {});
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
