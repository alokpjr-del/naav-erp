const { pool } = require('../src/postgres');

async function readDb() {
    console.log('=== STEP 1: READ-ONLY DATABASE QUERY ===');
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
          END AS "hasPassword"
        FROM "deliveryBoys"
        ORDER BY id;
    `);
    console.log('Current PostgreSQL "deliveryBoys" rows:');
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
}

readDb().catch(e => { console.error(e); process.exit(1); });
