const { pool } = require('../src/postgres');

async function clean() {
    await pool.query(`DELETE FROM entries WHERE id = 'TEST-ENTRY-01' OR id = 'TEST-ORD';`);
    await pool.query(`DELETE FROM expenses WHERE id = 'TEST-EXP';`);
    console.log('Cleaned test entries.');
    process.exit(0);
}
clean();
