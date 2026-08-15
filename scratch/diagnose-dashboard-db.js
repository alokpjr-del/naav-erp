const { pool } = require('../src/postgres');

async function diagnoseDashboardDb() {
    console.log('=== STEP 1: POSTGRESQL DATABASE CONTENTS AFTER MIGRATION ===');
    
    // 1. Orders / Entries
    const entriesRes = await pool.query(`SELECT id, "orderId", date, "customerName", "vendor", "onlineRate", "vendorRate", "deliveryCharge", profit, "orderStatus", "isSettled", cash, upi, "naavTransferred" FROM entries ORDER BY date DESC, id DESC;`);
    console.log(`Total Orders in Database: ${entriesRes.rows.length}`);
    console.log('Orders in DB:');
    console.log(JSON.stringify(entriesRes.rows, null, 2));

    // 2. Expenses
    const expensesRes = await pool.query(`SELECT id, "expenseId", date, category, "expenseName", amount, "paymentMode" FROM expenses ORDER BY date DESC, id DESC;`);
    console.log(`\nTotal Expenses in Database: ${expensesRes.rows.length}`);
    console.log('Expenses in DB:');
    console.log(JSON.stringify(expensesRes.rows, null, 2));

    // 3. Restaurant Settlements
    const restSettlementsRes = await pool.query(`SELECT id, restaurant, date, "paidAmount", "outstandingAmount", status FROM "restaurantSettlements" ORDER BY date DESC, id DESC;`);
    console.log(`\nTotal Restaurant Settlements in Database: ${restSettlementsRes.rows.length}`);
    console.log('Restaurant Settlements in DB:');
    console.log(JSON.stringify(restSettlementsRes.rows, null, 2));

    // 4. Rider Settlements
    const riderSettlementsRes = await pool.query(`SELECT id, rider, "from", "to", "netPayable", date FROM "riderSettlements" ORDER BY date DESC, id DESC;`);
    console.log(`\nTotal Rider Settlements in Database: ${riderSettlementsRes.rows.length}`);
    console.log('Rider Settlements in DB:');
    console.log(JSON.stringify(riderSettlementsRes.rows, null, 2));

    // 5. Day Close History
    const dayCloseRes = await pool.query(`SELECT id, date, "totalSales", "totalProfit", "totalExpenses", "netProfit" FROM "dayCloseHistory" ORDER BY date DESC, id DESC;`);
    console.log(`\nTotal Day Close Records in Database: ${dayCloseRes.rows.length}`);
    console.log('Day Close Records in DB:');
    console.log(JSON.stringify(dayCloseRes.rows, null, 2));

    process.exit(0);
}

diagnoseDashboardDb().catch(e => {
    console.error('Diagnosis Error:', e);
    process.exit(1);
});
