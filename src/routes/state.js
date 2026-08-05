async function saveSnapshot(snapshot) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const state = snapshot || {};
        const settings = state.settings || {};

        console.log('Before DELETE settings');
        await client.query('DELETE FROM settings');
        console.log('Before INSERT loop settings');
        for (const [key, value] of Object.entries(settings)) {
            await client.query(
                'INSERT INTO settings (key, value) VALUES ($1, $2)',
                [key, typeof value === 'string' ? value : JSON.stringify(value)]
            );
        }
        console.log('After INSERT loop settings');

        console.log('Before DELETE entries');
        await client.query('DELETE FROM entries');
        console.log('Before INSERT loop entries');
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
                Boolean(entry.isSettled) ? 1 : 0,
                entry.paidDate,
                entry.paidTime,
                entry.paidBy,
                entry.remarks,
                JSON.stringify(entry.timeline || [])
            ]);
        }
        console.log('After INSERT loop entries');

        console.log('Before DELETE expenses');
        await client.query('DELETE FROM expenses');
        console.log('Before INSERT loop expenses');
        for (const expense of state.expenses || []) {
            await client.query(`INSERT INTO expenses (id, expenseId, date, category, expenseName, amount, paymentMode, paidTo, refNo, remarks, createdBy, createdDateTime) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                expense.id, expense.expenseId, expense.date, expense.category, expense.expenseName, expense.amount, expense.paymentMode, expense.paidTo, expense.refNo, expense.remarks, expense.createdBy, expense.createdDateTime
            ]);
        }
        console.log('After INSERT loop expenses');

        console.log('Before DELETE restaurants');
        await client.query('DELETE FROM restaurants');
        console.log('Before INSERT loop restaurants');
        for (const restaurant of state.restaurants || []) {
            await client.query(`INSERT INTO restaurants (id, name, contactPerson, mobile, altMobile, address, gst, email, openTime, closeTime, status, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                restaurant.id, restaurant.name, restaurant.contactPerson, restaurant.mobile, restaurant.altMobile, restaurant.address, restaurant.gst, restaurant.email, restaurant.openTime, restaurant.closeTime, restaurant.status, restaurant.remarks
            ]);
        }
        console.log('After INSERT loop restaurants');

        console.log('Before DELETE deliveryBoys');
        await client.query('DELETE FROM deliveryBoys');
        console.log('Before INSERT loop deliveryBoys');
        for (const boy of state.deliveryBoys || []) {
            await client.query(`INSERT INTO deliveryBoys (id, name) VALUES ($1, $2)`, [boy.id, boy.name]);
        }
        console.log('After INSERT loop deliveryBoys');

        console.log('Before DELETE customers');
        await client.query('DELETE FROM customers');
        console.log('Before INSERT loop customers');
        for (const customer of state.customers || []) {
            await client.query(`INSERT INTO customers (id, name, mobile, address, email, remarks, createdDate) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                customer.id, customer.name, customer.mobile, customer.address, customer.email, customer.remarks, customer.createdDate
            ]);
        }
        console.log('After INSERT loop customers');

        console.log('Before DELETE recycleBin');
        await client.query('DELETE FROM recycleBin');
        console.log('Before INSERT loop recycleBin');
        for (const item of state.recycleBin || []) {
            await client.query(`INSERT INTO recycleBin (id, type, data, deletedAt) VALUES ($1, $2, $3, $4)`, [
                item.id, item.type, JSON.stringify(item.data || item), item.deletedAt
            ]);
        }
        console.log('After INSERT loop recycleBin');

        console.log('Before DELETE riderSettlements');
        await client.query('DELETE FROM riderSettlements');
        console.log('Before INSERT loop riderSettlements');
        for (const settlement of state.riderSettlements || []) {
            await client.query(`INSERT INTO riderSettlements (id, rider, from_date, to_date, orders, earnings, bonus, fine, advance, netPayable, mode, date, status, remarks, settledOrderIds) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, [
                settlement.id, settlement.rider, settlement.from, settlement.to, settlement.orders, settlement.earnings, settlement.bonus, settlement.fine, settlement.advance, settlement.netPayable, settlement.mode, settlement.date, settlement.status, settlement.remarks, JSON.stringify(settlement.settledOrderIds || [])
            ]);
        }
        console.log('After INSERT loop riderSettlements');

        console.log('Before DELETE restaurantSettlements');
        await client.query('DELETE FROM restaurantSettlements');
        console.log('Before INSERT loop restaurantSettlements');
        for (const settlement of state.restaurantSettlements || []) {
            await client.query(`INSERT INTO restaurantSettlements (id, vendor, from_date, to_date, orders, pendingAmount, paidAmount, outstandingAmount, mode, date, status, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                settlement.id, settlement.vendor, settlement.from, settlement.to, settlement.orders, settlement.pendingAmount, settlement.paidAmount, settlement.outstandingAmount, settlement.mode, settlement.date, settlement.status, settlement.remarks
            ]);
        }
        console.log('After INSERT loop restaurantSettlements');

        console.log('Before DELETE auditLog');
        await client.query('DELETE FROM auditLog');
        console.log('Before INSERT loop auditLog');
        for (const log of state.auditLog || []) {
            await client.query(`INSERT INTO auditLog (id, date, time, "user", action, details) VALUES ($1, $2, $3, $4, $5, $6)`, [
                log.id || null, log.date, log.time, log.user, log.action, log.details
            ]);
        }
        console.log('After INSERT loop auditLog');

        console.log('Before DELETE administrators');
        await client.query('DELETE FROM administrators');
        console.log('Before INSERT loop administrators');
        for (const admin of state.administrators || []) {
            await client.query(`INSERT INTO administrators (id, fullName, username, password, mobile, email, role, status, createdDate, modifiedDate, lastLogin, lastLogout, createdBy, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, [
                admin.id, admin.fullName, admin.username, admin.password, admin.mobile, admin.email, admin.role, admin.status, admin.createdDate, admin.modifiedDate, admin.lastLogin, admin.lastLogout, admin.createdBy, admin.remarks
            ]);
        }
        console.log('After INSERT loop administrators');

        console.log('Before DELETE dayCloseHistory');
        await client.query('DELETE FROM dayCloseHistory');
        console.log('Before INSERT loop dayCloseHistory');
        for (const history of state.dayCloseHistory || []) {
            await client.query(`INSERT INTO dayCloseHistory (date, totalOrders, totalSales, totalProfit, totalExpenses, netProfit, closedBy, closedAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                history.date, history.totalOrders, history.totalSales, history.totalProfit, history.totalExpenses, history.netProfit, history.closedBy, history.closedAt
            ]);
        }
        console.log('After INSERT loop dayCloseHistory');

        console.log('Before DELETE counters');
        await client.query('DELETE FROM counters');
        console.log('Before INSERT loop counters');
        await client.query(`INSERT INTO counters (name, val) VALUES ('orderCounter', $1)`, [Number(state.orderCounter || 1)]);
        await client.query(`INSERT INTO counters (name, val) VALUES ('expenseCounter', $1)`, [Number(state.expenseCounter || 1)]);
        console.log('After INSERT loop counters');

        console.log('Before COMMIT');
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