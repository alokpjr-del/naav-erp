const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');

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
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const state = snapshot || {};
        const settings = state.settings || {};

        await client.query('DELETE FROM settings');
        for (const [key, value] of Object.entries(settings)) {
            await client.query(
                'INSERT INTO settings (key, value) VALUES ($1, $2)',
                [key, typeof value === 'string' ? value : JSON.stringify(value)]
            );
        }

        await client.query('DELETE FROM entries');
        for (const entry of state.entries || []) {
            await client.query(`INSERT INTO entries (
                id, orderId, date, customerName, customerMobile, customerAddress, vendor, vendorRate, location, category, onlineRate, percentage, deliveryCharge, profit, deliveryBoy, cash, upi, naavTransferred, orderStatus, isSettled, paidDate, paidTime, paidBy, remarks, timeline
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`, [
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
                Boolean(entry.isSettled),
                entry.paidDate,
                entry.paidTime,
                entry.paidBy,
                entry.remarks,
                JSON.stringify(entry.timeline || [])
            ]);
        }

        await client.query('DELETE FROM expenses');
        for (const expense of state.expenses || []) {
            await client.query(`INSERT INTO expenses (id, expenseId, date, category, expenseName, amount, paymentMode, paidTo, refNo, remarks, createdBy, createdDateTime) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                expense.id, expense.expenseId, expense.date, expense.category, expense.expenseName, expense.amount, expense.paymentMode, expense.paidTo, expense.refNo, expense.remarks, expense.createdBy, expense.createdDateTime
            ]);
        }

        await client.query('DELETE FROM restaurants');
        for (const restaurant of state.restaurants || []) {
            await client.query(`INSERT INTO restaurants (id, name, contactPerson, mobile, altMobile, address, gst, email, openTime, closeTime, status, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                restaurant.id, restaurant.name, restaurant.contactPerson, restaurant.mobile, restaurant.altMobile, restaurant.address, restaurant.gst, restaurant.email, restaurant.openTime, restaurant.closeTime, restaurant.status, restaurant.remarks
            ]);
        }

        await client.query('DELETE FROM deliveryBoys');
        for (const boy of state.deliveryBoys || []) {
            await client.query(`INSERT INTO deliveryBoys (id, name) VALUES ($1, $2)`, [boy.id, boy.name]);
        }

        await client.query('DELETE FROM customers');
        for (const customer of state.customers || []) {
            await client.query(`INSERT INTO customers (id, name, mobile, address, email, remarks, createdDate) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                customer.id, customer.name, customer.mobile, customer.address, customer.email, customer.remarks, customer.createdDate
            ]);
        }

        await client.query('DELETE FROM recycleBin');
        for (const item of state.recycleBin || []) {
            await client.query(`INSERT INTO recycleBin (id, type, data, deletedAt) VALUES ($1, $2, $3, $4)`, [
                item.id, item.type, JSON.stringify(item.data || item), item.deletedAt
            ]);
        }

        await client.query('DELETE FROM riderSettlements');
        for (const settlement of state.riderSettlements || []) {
            await client.query(`INSERT INTO riderSettlements (id, rider, from_date, to_date, orders, earnings, bonus, fine, advance, netPayable, mode, date, status, remarks, settledOrderIds) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, [
                settlement.id, settlement.rider, settlement.from, settlement.to, settlement.orders, settlement.earnings, settlement.bonus, settlement.fine, settlement.advance, settlement.netPayable, settlement.mode, settlement.date, settlement.status, settlement.remarks, JSON.stringify(settlement.settledOrderIds || [])
            ]);
        }

        await client.query('DELETE FROM restaurantSettlements');
        for (const settlement of state.restaurantSettlements || []) {
            await client.query(`INSERT INTO restaurantSettlements (id, vendor, from_date, to_date, orders, pendingAmount, paidAmount, outstandingAmount, mode, date, status, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                settlement.id, settlement.vendor, settlement.from, settlement.to, settlement.orders, settlement.pendingAmount, settlement.paidAmount, settlement.outstandingAmount, settlement.mode, settlement.date, settlement.status, settlement.remarks
            ]);
        }

        await client.query('DELETE FROM auditLog');
        for (const log of state.auditLog || []) {
            await client.query(`INSERT INTO auditLog (id, date, time, user, action, details) VALUES ($1, $2, $3, $4, $5, $6)`, [
                log.id || null, log.date, log.time, log.user, log.action, log.details
            ]);
        }

        await client.query('DELETE FROM administrators');
        for (const admin of state.administrators || []) {
            await client.query(`INSERT INTO administrators (id, fullName, username, password, mobile, email, role, status, createdDate, modifiedDate, lastLogin, lastLogout, createdBy, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, [
                admin.id, admin.fullName, admin.username, admin.password, admin.mobile, admin.email, admin.role, admin.status, admin.createdDate, admin.modifiedDate, admin.lastLogin, admin.lastLogout, admin.createdBy, admin.remarks
            ]);
        }

        await client.query('DELETE FROM dayCloseHistory');
        for (const history of state.dayCloseHistory || []) {
            await client.query(`INSERT INTO dayCloseHistory (date, totalOrders, totalSales, totalProfit, totalExpenses, netProfit, closedBy, closedAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                history.date, history.totalOrders, history.totalSales, history.totalProfit, history.totalExpenses, history.netProfit, history.closedBy, history.closedAt
            ]);
        }

        await client.query('DELETE FROM counters');
        await client.query(`INSERT INTO counters (name, val) VALUES ('orderCounter', $1)`, [Number(state.orderCounter || 1)]);
        await client.query(`INSERT INTO counters (name, val) VALUES ('expenseCounter', $1)`, [Number(state.expenseCounter || 1)]);

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

router.get('/', async (req, res) => {
    try {
        const settingsResult = await pool.query('SELECT * FROM settings');
        const settingsRows = settingsResult.rows;
        const settings = { companyName: 'NAAV ACCOUNTS', customCategories: [], lastBackupDate: 'Never' };
        settingsRows.forEach((row) => {
            if (row.key === 'customCategories') {
                settings.customCategories = parseJson(row.value, []);
            } else {
                settings[row.key] = row.value;
            }
        });

        const entriesResult = await pool.query('SELECT * FROM entries');
        const entries = entriesResult.rows.map((entry) => ({
            ...entry,
            isSettled: Boolean(entry.isSettled),
            timeline: parseJson(entry.timeline, [])
        }));

        const expensesResult = await pool.query('SELECT * FROM expenses');
        const expenses = expensesResult.rows;

        const recycleBinResult = await pool.query('SELECT * FROM recycleBin');
        const recycleBin = recycleBinResult.rows.map((item) => ({
            ...item,
            data: parseJson(item.data, {})
        }));

        const restaurantsResult = await pool.query('SELECT * FROM restaurants');
        const restaurants = restaurantsResult.rows;

        const deliveryBoysResult = await pool.query('SELECT * FROM deliveryBoys');
        const deliveryBoys = deliveryBoysResult.rows;

        const customersResult = await pool.query('SELECT * FROM customers');
        const customers = customersResult.rows;

        const riderSettlementsResult = await pool.query('SELECT * FROM riderSettlements');
        const riderSettlements = riderSettlementsResult.rows.map((entry) => ({
            ...entry,
            settledOrderIds: parseJson(entry.settledOrderIds, [])
        }));

        const restaurantSettlementsResult = await pool.query('SELECT * FROM restaurantSettlements ORDER BY date DESC, id DESC');
        const restaurantSettlements = restaurantSettlementsResult.rows;

        const auditLogResult = await pool.query('SELECT * FROM auditLog ORDER BY id DESC');
        const auditLog = auditLogResult.rows;

        const administratorsResult = await pool.query('SELECT * FROM administrators');
        const administrators = administratorsResult.rows;

        const dayCloseHistoryResult = await pool.query('SELECT * FROM dayCloseHistory');
        const dayCloseHistory = dayCloseHistoryResult.rows;

        const orderCounterResult = await pool.query('SELECT val FROM counters WHERE name = $1', ['orderCounter']);
        const expenseCounterResult = await pool.query('SELECT val FROM counters WHERE name = $1', ['expenseCounter']);
        
        const orderCounter = orderCounterResult.rows[0];
        const expenseCounter = expenseCounterResult.rows[0];

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