const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');
const bcrypt = require('bcryptjs');

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

// ---------------------------------------------------------------------------
// IDENTIFIER QUOTING — READ THIS BEFORE EDITING THIS FILE
// ---------------------------------------------------------------------------
// src/postgres-schema.js creates every camelCase column/table using DOUBLE
// QUOTES, e.g.  ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS "contactPerson" TEXT
// A double-quoted identifier in Postgres is stored EXACTLY as written and is
// case-sensitive forever after. Every query in this file that touches one of
// those identifiers MUST also double-quote it, or Postgres silently folds the
// unquoted version to all-lowercase and looks for a column/table that does
// not exist (e.g. `contactPerson` unquoted becomes `contactperson`, which is
// NOT the same column as `"contactPerson"`).
//
// This was the root cause of records "disappearing after refresh": the old
// INSERT statements below referenced camelCase columns/tables WITHOUT quotes.
// Postgres threw "column ... does not exist" / "relation ... does not exist",
// the whole saveSnapshot() transaction was rolled back, and POST /api/state
// returned a 500 — but the frontend updates its in-memory `db` object and
// re-renders BEFORE checking whether the save actually succeeded, so the
// change looked like it worked until the next page load re-fetched the
// (unchanged) data from Postgres. Every INSERT/DELETE below is now quoted to
// match src/postgres-schema.js exactly. SELECT * is safe as-is because
// Postgres returns the real stored column names regardless of how you spell
// the table name in FROM — but the table name itself in FROM/DELETE/INSERT
// still needs quoting when the table was created with a quoted mixed-case
// name (deliveryBoys, recycleBin, riderSettlements, restaurantSettlements,
// auditLog, dayCloseHistory).
// ---------------------------------------------------------------------------

// Every table below has a NOT NULL primary key (TEXT id for most, or
// SERIAL for auditLog, or TEXT date for dayCloseHistory). We already hit
// this exact failure mode in production for auditLog.id (NULL insert into
// a NOT NULL column). The same class of bug can happen for any of these
// tables if the frontend ever sends a row without its id/date set — and
// because saveSnapshot() runs the whole save as one transaction, a single
// bad row currently rolls back EVERY other legitimate change in that same
// save. This helper filters out and logs rows missing their required key
// instead of letting them abort the entire snapshot, without changing any
// behavior for well-formed rows (the normal, currently-working case).
function withRequiredKey(rows, key, label) {
    const valid = [];
    for (const row of rows || []) {
        if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') {
            valid.push(row);
        } else {
            console.warn(`saveSnapshot: skipping "${label}" row with missing "${key}"`, row);
        }
    }
    return valid;
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
        for (const entry of withRequiredKey(state.entries, 'id', 'entries')) {
            await client.query(`INSERT INTO entries (
                id, "orderId", date, "customerName", "customerMobile", "customerAddress", vendor, "vendorRate", location, category, "onlineRate", percentage, "deliveryCharge", profit, "deliveryBoy", cash, upi, "naavTransferred", "orderStatus", "isSettled", "paidDate", "paidTime", "paidBy", remarks, timeline
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
                Boolean(entry.isSettled) ? 1 : 0,
                entry.paidDate,
                entry.paidTime,
                entry.paidBy,
                entry.remarks,
                JSON.stringify(entry.timeline || [])
            ]);
        }

        await client.query('DELETE FROM expenses');
        for (const expense of withRequiredKey(state.expenses, 'id', 'expenses')) {
            await client.query(`INSERT INTO expenses (id, "expenseId", date, category, "expenseName", amount, "paymentMode", "paidTo", "refNo", remarks, "createdBy", "createdDateTime") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                expense.id, expense.expenseId, expense.date, expense.category, expense.expenseName, expense.amount, expense.paymentMode, expense.paidTo, expense.refNo, expense.remarks, expense.createdBy, expense.createdDateTime
            ]);
        }

        await client.query('DELETE FROM restaurants');
        for (const restaurant of withRequiredKey(state.restaurants, 'id', 'restaurants')) {
            await client.query(`INSERT INTO restaurants (id, name, "contactPerson", mobile, "altMobile", address, gst, email, "openTime", "closeTime", status, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                restaurant.id, restaurant.name, restaurant.contactPerson, restaurant.mobile, restaurant.altMobile, restaurant.address, restaurant.gst, restaurant.email, restaurant.openTime, restaurant.closeTime, restaurant.status, restaurant.remarks
            ]);
        }

        await client.query('DELETE FROM "deliveryBoys"');
        for (const boy of withRequiredKey(state.deliveryBoys, 'id', 'deliveryBoys')) {
            await client.query(`INSERT INTO "deliveryBoys" (id, name, mobile, "passwordHash", status) VALUES ($1, $2, $3, $4, $5)`, [
                boy.id, boy.name, boy.mobile || null, boy.passwordHash || null, boy.status || 'Active'
            ]);
        }

        await client.query('DELETE FROM customers');
        for (const customer of withRequiredKey(state.customers, 'id', 'customers')) {
            await client.query(`INSERT INTO customers (id, name, mobile, address, email, remarks, "createdDate") VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                customer.id, customer.name, customer.mobile, customer.address, customer.email, customer.remarks, customer.createdDate
            ]);
        }

        await client.query('DELETE FROM "recycleBin"');
        for (const item of withRequiredKey(state.recycleBin, 'id', 'recycleBin')) {
            await client.query(`INSERT INTO "recycleBin" (id, type, data, "deletedAt") VALUES ($1, $2, $3, $4)`, [
                item.id, item.type, JSON.stringify(item.data || item), item.deletedAt
            ]);
        }

        await client.query('DELETE FROM "riderSettlements"');
        for (const settlement of withRequiredKey(state.riderSettlements, 'id', 'riderSettlements')) {
            await client.query(`INSERT INTO "riderSettlements" (id, rider, from_date, to_date, orders, earnings, bonus, fine, advance, "netPayable", mode, date, status, remarks, "settledOrderIds") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, [
                settlement.id, settlement.rider, settlement.from, settlement.to, settlement.orders, settlement.earnings, settlement.bonus, settlement.fine, settlement.advance, settlement.netPayable, settlement.mode, settlement.date, settlement.status, settlement.remarks, JSON.stringify(settlement.settledOrderIds || [])
            ]);
        }

        await client.query('DELETE FROM "restaurantSettlements"');
        for (const settlement of withRequiredKey(state.restaurantSettlements, 'id', 'restaurantSettlements')) {
            await client.query(`INSERT INTO "restaurantSettlements" (id, vendor, from_date, to_date, orders, "pendingAmount", "paidAmount", "outstandingAmount", mode, date, status, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                settlement.id, settlement.vendor, settlement.from, settlement.to, settlement.orders, settlement.pendingAmount, settlement.paidAmount, settlement.outstandingAmount, settlement.mode, settlement.date, settlement.status, settlement.remarks
            ]);
        }

        await client.query('DELETE FROM "auditLog"');
        for (const log of state.auditLog || []) {
            // "auditLog".id is SERIAL PRIMARY KEY (see postgres-schema.js) —
            // it is NOT NULL with a sequence-generated default. The previous
            // version of this query included `id` in the column list and
            // passed `log.id || null`. Client-side log entries built in
            // index.html don't carry a real DB id until after their first
            // successful round trip, so this frequently evaluated to an
            // explicit NULL — and explicitly inserting NULL into a NOT NULL
            // SERIAL column fails the not-null constraint regardless of the
            // column having a default, because a provided value (even NULL)
            // always overrides the default. The fix is to never mention
            // `id` in the INSERT at all, so Postgres applies nextval() as
            // designed. Since this table is fully replaced on every
            // snapshot save (DELETE FROM "auditLog" above), there is no
            // need to preserve old ids — they're only ever used for
            // "ORDER BY id DESC" (newest first), which is preserved because
            // rows are inserted here in the same order they appear in
            // state.auditLog.
            await client.query(`INSERT INTO "auditLog" (date, time, "user", action, details) VALUES ($1, $2, $3, $4, $5)`, [
                log.date, log.time, log.user, log.action, log.details
            ]);
        }

        await client.query('DELETE FROM administrators');
        for (const admin of withRequiredKey(state.administrators, 'id', 'administrators')) {
            let passwordToStore = admin.password || '';
            const isAlreadyHashed = passwordToStore.startsWith('$2a$') || passwordToStore.startsWith('$2b$');
            if (!isAlreadyHashed) {
                passwordToStore = await bcrypt.hash(passwordToStore, 10);
            }

            await client.query(`INSERT INTO administrators (id, "fullName", username, password, mobile, email, role, status, "createdDate", "modifiedDate", "lastLogin", "lastLogout", "createdBy", remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, [
                admin.id, admin.fullName, admin.username, passwordToStore, admin.mobile, admin.email, admin.role, admin.status, admin.createdDate, admin.modifiedDate, admin.lastLogin, admin.lastLogout, admin.createdBy, admin.remarks
            ]);
        }

        await client.query('DELETE FROM "dayCloseHistory"');
        for (const history of withRequiredKey(state.dayCloseHistory, 'date', 'dayCloseHistory')) {
            await client.query(`INSERT INTO "dayCloseHistory" (date, "totalOrders", "totalSales", "totalProfit", "totalExpenses", "netProfit", "closedBy", "closedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                history.date, history.totalOrders, history.totalSales, history.totalProfit, history.totalExpenses, history.netProfit, history.closedBy, history.closedAt
            ]);
        }

        await client.query('DELETE FROM counters');
        await client.query(`INSERT INTO counters (name, val) VALUES ('orderCounter', $1)`, [Number(state.orderCounter || 1)]);
        await client.query(`INSERT INTO counters (name, val) VALUES ('expenseCounter', $1)`, [Number(state.expenseCounter || 1)]);

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');

        console.error("========== STATE SAVE ERROR ==========");
        console.error(e);
        console.error(e.stack);

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

        const recycleBinResult = await pool.query('SELECT * FROM "recycleBin"');
        const recycleBin = recycleBinResult.rows.map((item) => ({
            ...item,
            data: parseJson(item.data, {})
        }));

        const restaurantsResult = await pool.query('SELECT * FROM restaurants ORDER BY name');
        const restaurants = restaurantsResult.rows.map((restaurant) => ({
            id: restaurant.id,
            name: restaurant.name,
            contactPerson: restaurant.contactPerson,
            mobile: restaurant.mobile,
            altMobile: restaurant.altMobile,
            address: restaurant.address,
            gst: restaurant.gst,
            email: restaurant.email,
            openTime: restaurant.openTime,
            closeTime: restaurant.closeTime,
            status: restaurant.status,
            remarks: restaurant.remarks
        }));

        const deliveryBoysResult = await pool.query('SELECT * FROM "deliveryBoys"');
        const deliveryBoys = deliveryBoysResult.rows;

        const customersResult = await pool.query('SELECT * FROM customers');
        const customers = customersResult.rows;

        const riderSettlementsResult = await pool.query('SELECT * FROM "riderSettlements"');
        const riderSettlements = riderSettlementsResult.rows.map((entry) => ({
            ...entry,
            settledOrderIds: parseJson(entry.settledOrderIds, [])
        }));

        const restaurantSettlementsResult = await pool.query('SELECT * FROM "restaurantSettlements" ORDER BY date DESC, id DESC');
        const restaurantSettlements = restaurantSettlementsResult.rows;

        const auditLogResult = await pool.query('SELECT * FROM "auditLog" ORDER BY id DESC');
        const auditLog = auditLogResult.rows;

        const administratorsResult = await pool.query('SELECT * FROM administrators');
        const administrators = administratorsResult.rows;

        const dayCloseHistoryResult = await pool.query('SELECT * FROM "dayCloseHistory"');
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
        console.error("========== GET /api/state FAILED ==========");
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    // Guards against the edge case where req.body isn't a plain object
    // (e.g. an array, a string, or missing entirely). Without this, code
    // like `state.entries` on an array silently resolves to Array's own
    // built-in `.entries` method instead of `undefined`, which then fails
    // deep inside the transaction with a confusing "not iterable" error
    // instead of a clear 400. This does not change behavior for any
    // request shaped like the normal snapshot object the frontend sends.
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ success: false, error: 'Request body must be a JSON object' });
    }

    try {
        await saveSnapshot(body);
        res.json({ success: true });
    } catch (e) {
        console.error("POST /api/state FAILED");
        console.error(e);
        console.error(e.stack);

        res.status(500).json({
            success: false,
            error: e.message
        });
    }
});

module.exports = router;
