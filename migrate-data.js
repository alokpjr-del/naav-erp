const Database = require('better-sqlite3');
const path = require('path');
const { pool } = require('./src/postgres');
const { initTables } = require('./src/postgres-schema');

const dbPath = path.join(__dirname, 'data', 'naav_accounts.db');

// REAL/NUMERIC columns per table (must match postgres-schema.js)
const REAL_COLUMNS = {
    entries: ['vendorRate', 'onlineRate', 'percentage', 'deliveryCharge', 'profit', 'naavTransferred'],
    expenses: ['amount'],
    riderSettlements: ['bonus', 'fine', 'advance'],
    restaurantSettlements: ['paidAmount', 'outstandingAmount'],
    dayCloseHistory: ['totalSales', 'totalProfit', 'totalExpenses', 'netProfit']
};

function sanitizeNumeric(value) {
    if (value === null || value === undefined) return 0;

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    let str = String(value).trim();

    if (str === '') return 0;

    str = str.replace(/₹/g, '');
    str = str.replace(/,/g, '');
    str = str.replace(/\s/g, '');

    if (str === '' || str === '-') return 0;

    const num = parseFloat(str);
    return Number.isFinite(num) ? num : 0;
}

function sanitizeRow(tableName, row) {
    const realCols = REAL_COLUMNS[tableName];
    if (!realCols || realCols.length === 0) return row;

    const sanitized = { ...row };
    for (const col of realCols) {
        if (Object.prototype.hasOwnProperty.call(sanitized, col)) {
            sanitized[col] = sanitizeNumeric(sanitized[col]);
        }
    }
    return sanitized;
}

async function migrate() {
    console.log('Starting data migration from SQLite to PostgreSQL...');

    // Ensure tables and default schemas are set up first
    await initTables();

    let sqliteDb;
    try {
        sqliteDb = new Database(dbPath, { readonly: true });
    } catch (err) {
        console.error('Failed to open SQLite database:', err.message);
        process.exit(1);
    }

    const tables = [
        'settings',
        'administrators',
        'restaurants',
        'deliveryBoys',
        'riders',
        'customers',
        'entries',
        'expenses',
        'riderSettlements',
        'restaurantSettlements',
        'auditLog',
        'dayCloseHistory',
        'counters',
        'recycleBin'
    ];

    let totalMigratedAll = 0;
    let totalSkippedAll = 0;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const tableName of tables) {
            let rows = [];
            try {
                rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
            } catch (err) {
                console.warn(`Table ${tableName} does not exist in SQLite or couldn't be read. Skipping.`);
                continue;
            }

            let rowsMigrated = 0;
            let rowsSkipped = 0;

            if (rows.length === 0) {
                console.log(`\nTable Name: ${tableName}`);
                console.log(`Rows Migrated: 0`);
                console.log(`Rows Skipped: 0`);
                continue;
            }

            for (const rawRow of rows) {
                const row = sanitizeRow(tableName, rawRow);

                const keys = Object.keys(row);
                const values = Object.values(row);
                const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
                const columns = keys.map(k => `"${k}"`).join(', ');

                const query = `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

                const res = await client.query(query, values);
                if (res.rowCount > 0) {
                    rowsMigrated++;
                } else {
                    rowsSkipped++;
                }
            }

            // Handle auto-increment sequence sync for auditLog if applicable
            if (tableName === 'auditLog' && rows.length > 0) {
                await client.query(
                    `SELECT setval(pg_get_serial_sequence('"auditLog"', 'id'), COALESCE(MAX(id), 1)) FROM "auditLog"`
                );
            }

            totalMigratedAll += rowsMigrated;
            totalSkippedAll += rowsSkipped;

            console.log(`\nTable Name: ${tableName}`);
            console.log(`Rows Migrated: ${rowsMigrated}`);
            console.log(`Rows Skipped: ${rowsSkipped}`);
        }

        await client.query('COMMIT');

        console.log('\n==============================');
        console.log('MIGRATION SUMMARY');
        console.log('==============================');
        console.log(`Total Rows Migrated: ${totalMigratedAll}`);
        console.log(`Total Rows Skipped: ${totalSkippedAll}`);
        console.log('Migration completed successfully.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed, rolled back all changes:', err.message);
    } finally {
        client.release();
        sqliteDb.close();
        await pool.end();
    }
}

migrate();
