const { pool } = require('../src/postgres');

async function diagnoseOrders() {
    console.log('=== CHECKING DISTINCT deliveryBoy VALUES IN ENTRIES (ORDERS) TABLE ===');
    const res = await pool.query(`SELECT DISTINCT "deliveryBoy" FROM entries WHERE "deliveryBoy" IS NOT NULL AND "deliveryBoy" != '' ORDER BY "deliveryBoy";`);
    console.log('Distinct Delivery Boys in Orders:', res.rows);

    console.log('\n=== CHECKING auditLog STRUCTURE AND RECENT AUDIT ENTRIES ===');
    const auditRes = await pool.query(`SELECT * FROM "auditLog" ORDER BY id DESC LIMIT 20;`);
    console.log('Recent Audit Log entries:', JSON.stringify(auditRes.rows, null, 2));

    process.exit(0);
}

diagnoseOrders().catch(e => console.error(e));
