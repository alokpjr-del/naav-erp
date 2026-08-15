const { pool } = require('../src/postgres');

async function restoreRiders() {
    console.log('=== RESTORING ALOK RIDER RECORDS IN POSTGRESQL ===');
    
    // Insert D-1786723522603 (Alok) if missing
    await pool.query(`
        INSERT INTO "deliveryBoys" (id, name, status)
        VALUES ($1, $2, $3)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
    `, ['D-1786723522603', 'Alok', 'Active']);

    // Insert D-1786009437048 (Alok) if missing
    await pool.query(`
        INSERT INTO "deliveryBoys" (id, name, mobile, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, mobile = COALESCE(EXCLUDED.mobile, "deliveryBoys".mobile), status = EXCLUDED.status
    `, ['D-1786009437048', 'Alok', '8660989327', 'Active']);

    const res = await pool.query(`SELECT id, name, mobile, status, CASE WHEN "passwordHash" IS NOT NULL AND "passwordHash" != '' THEN true ELSE false END as "hasPassword" FROM "deliveryBoys" ORDER BY id;`);
    console.log('Updated PostgreSQL deliveryBoys Table:');
    console.log(JSON.stringify(res.rows, null, 2));

    process.exit(0);
}

restoreRiders().catch(e => { console.error(e); process.exit(1); });
