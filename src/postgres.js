const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Prevents a client from hanging forever trying to acquire a connection
  // if the DB is unreachable/overloaded — without this, pg's default is
  // effectively "wait indefinitely", which can pile up hung requests.
  connectionTimeoutMillis: 10000
});

// pg's Pool is an EventEmitter. If an idle client in the pool errors out
// (e.g. the DB restarts, or a network blip drops an idle TCP connection —
// both routine on managed hosting like Render), pg emits an 'error' event
// on the pool. Node's EventEmitter throws/crashes the ENTIRE process if an
// 'error' event has no listener. This was previously unguarded, so a
// single transient idle-connection drop could take the whole server down.
// This handler is purely defensive logging — it does not change any
// request-handling behavior.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
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
    console.error(err);
    // Previously this error was swallowed here and never propagated, which
    // silently defeated the try/catch + process.exit(1) around
    // testConnection() in server.js — that code could never actually run,
    // because this function never rejected. The server would then plow
    // ahead into initTables() and app.listen() even with a dead DB
    // connection pool, only failing later (and less clearly) on the first
    // real query. Rethrowing here makes testConnection() behave exactly as
    // its name and its caller already assume it does.
    throw err;
  }
}

module.exports = {
  pool,
  testConnection
};
