const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✅ PostgreSQL Connected Successfully');
    console.log(res.rows[0]);
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL Connection Failed');
    console.error(err);   // <-- Full error print ಆಗುತ್ತದೆ
  }
}

module.exports = {
  pool,
  testConnection
};