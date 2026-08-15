const { pool } = require('../src/postgres');

function normalizeDateStr(dateStr) {
    if (!dateStr) return '';
    let str = String(dateStr).trim();
    if (str.includes('T')) str = str.split('T')[0];
    if (str.includes(' ')) str = str.split(' ')[0];
    str = str.replace(/\./g, '-').replace(/\//g, '-');
    const parts = str.split('-').filter(p => p.length > 0);
    if (parts.length !== 3) return str;
    if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return str;
}

async function testDashboardCalculation() {
    console.log('=== TESTING DASHBOARD CALCULATIONS WITH POSTGRESQL DATA ===');

    // Fetch state like GET /api/state does
    const entriesRes = await pool.query(`SELECT * FROM entries;`);
    const expensesRes = await pool.query(`SELECT * FROM expenses;`);
    const deliveryBoysRes = await pool.query(`SELECT * FROM "deliveryBoys";`);
    const riderSettlementsRes = await pool.query(`SELECT * FROM "riderSettlements";`);
    const restSettlementsRes = await pool.query(`SELECT * FROM "restaurantSettlements";`);

    const db = {
        entries: entriesRes.rows,
        expenses: expensesRes.rows,
        deliveryBoys: deliveryBoysRes.rows,
        riderSettlements: riderSettlementsRes.rows,
        restaurantSettlements: restSettlementsRes.rows
    };

    console.log(`Loaded from DB: ${db.entries.length} entries, ${db.expenses.length} expenses, ${db.restaurantSettlements.length} rest settlements.`);

    // --- CASE A: EVALUATION FOR TODAY (2026-08-15) ---
    console.log('\n--- CASE A: EVALUATION FOR TODAY (2026-08-15) ---');
    const targetDateToday = '2026-08-15';
    let ordersToday = 0, profitToday = 0, cashToday = 0, upiToday = 0, expToday = 0;
    db.entries.forEach(e => {
        if (normalizeDateStr(e.date) === targetDateToday) {
            ordersToday++;
            profitToday += Number(e.profit || 0);
        }
    });
    db.expenses.forEach(ex => {
        if (normalizeDateStr(ex.date) === targetDateToday) expToday += Number(ex.amount || 0);
    });
    console.log(`Orders for ${targetDateToday}:`, ordersToday);
    console.log(`Profit for ${targetDateToday}:`, profitToday);
    console.log(`Expenses for ${targetDateToday}:`, expToday);

    // --- CASE B: EVALUATION FOR HISTORICAL DATE (2026-08-02) ---
    console.log('\n--- CASE B: EVALUATION FOR HISTORICAL DATE (2026-08-02) ---');
    const targetDateHist = '2026-08-02';
    let ordersHist = 0, profitHist = 0, expHist = 0, naavTransHist = 0;
    db.entries.forEach(e => {
        if (normalizeDateStr(e.date) === targetDateHist) {
            ordersHist++;
            profitHist += Number(e.profit || 0);
            naavTransHist += Number(e.naavTransferred || 0);
        }
    });
    db.expenses.forEach(ex => {
        if (normalizeDateStr(ex.date) === targetDateHist) expHist += Number(ex.amount || 0);
    });
    console.log(`Orders for ${targetDateHist}:`, ordersHist);
    console.log(`Profit for ${targetDateHist}:`, profitHist);
    console.log(`NAAV Transferred for ${targetDateHist}:`, naavTransHist);
    console.log(`Expenses for ${targetDateHist}:`, expHist);
    console.log(`Net Profit for ${targetDateHist}:`, profitHist - expHist);

    // --- CASE C: EVALUATION FOR HISTORICAL DATE (2026-08-01) ---
    console.log('\n--- CASE C: EVALUATION FOR HISTORICAL DATE (2026-08-01) ---');
    const targetDateHist1 = '2026-08-01';
    let expHist1 = 0;
    db.expenses.forEach(ex => {
        if (normalizeDateStr(ex.date) === targetDateHist1) expHist1 += Number(ex.amount || 0);
    });
    console.log(`Expenses for ${targetDateHist1}: ₹${expHist1}`);

    process.exit(0);
}

testDashboardCalculation().catch(e => { console.error(e); process.exit(1); });
