const { pool } = require('../src/postgres');

async function diagnose() {
    console.log('=== STEP 1: READ-ONLY QUERY OF POSTGRESQL "deliveryBoys" TABLE ===');
    try {
        const res = await pool.query(`
            SELECT
              id,
              name,
              mobile,
              status,
              CASE
                WHEN "passwordHash" IS NULL OR "passwordHash" = ''
                THEN false
                ELSE true
              END AS "hasPassword",
              "passwordHash"
            FROM "deliveryBoys"
            ORDER BY id;
        `);
        console.log(`Total rows in "deliveryBoys" table: ${res.rows.length}`);
        console.log(JSON.stringify(res.rows, null, 2));

        console.log('\n=== STEP 2: CHECK IF OTHER TABLES / SNAPSHOTS CONTAIN DELIVERY BOYS DATA ===');
        const settingsRes = await pool.query(`SELECT * FROM settings WHERE key LIKE '%delivery%' OR key LIKE '%state%'`);
        console.log('Settings matches:', settingsRes.rows);

        const auditRes = await pool.query(`SELECT * FROM "auditLog" WHERE "description" LIKE '%Delivery Boy%' ORDER BY id DESC LIMIT 20`);
        console.log('Audit log matches for Delivery Boys:', JSON.stringify(auditRes.rows, null, 2));

    } catch (e) {
        console.error('Diagnosis Query Error:', e);
    }
    process.exit(0);
}

diagnose();
