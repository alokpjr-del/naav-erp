const { pool } = require('./postgres');
const bcrypt = require('bcryptjs');

async function initTables() {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS administrators (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS "fullName" TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS username TEXT UNIQUE`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS password TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS mobile TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS email TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS role TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS status TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS "createdDate" TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS "modifiedDate" TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS "lastLogin" TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS "lastLogout" TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS "createdBy" TEXT`);
            await client.query(`ALTER TABLE administrators ADD COLUMN IF NOT EXISTS remarks TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS entries (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "orderId" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS date TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "customerName" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "customerMobile" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "customerAddress" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS vendor TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "vendorRate" REAL`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS location TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS category TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "onlineRate" REAL`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS percentage REAL`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "deliveryCharge" REAL`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS profit REAL`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "deliveryBoy" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS cash TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS upi TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "naavTransferred" REAL`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "orderStatus" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "isSettled" INTEGER`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "paidDate" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "paidTime" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS "paidBy" TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS remarks TEXT`);
            await client.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS timeline TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS restaurants (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS name TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS "contactPerson" TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS mobile TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS "altMobile" TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS address TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gst TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS email TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS "openTime" TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS "closeTime" TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status TEXT`);
            await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS remarks TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS "deliveryBoys" (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE "deliveryBoys" ADD COLUMN IF NOT EXISTS name TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS expenses (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "expenseId" TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS date TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "expenseName" TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount REAL`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "paymentMode" TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "paidTo" TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "refNo" TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS remarks TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "createdBy" TEXT`);
            await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "createdDateTime" TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS riders (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE riders ADD COLUMN IF NOT EXISTS name TEXT`);
            await client.query(`ALTER TABLE riders ADD COLUMN IF NOT EXISTS mobile TEXT`);
            await client.query(`ALTER TABLE riders ADD COLUMN IF NOT EXISTS status TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS customers (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT`);
            await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile TEXT`);
            await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT`);
            await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT`);
            await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS remarks TEXT`);
            await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS "createdDate" TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS "recycleBin" (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE "recycleBin" ADD COLUMN IF NOT EXISTS type TEXT`);
            await client.query(`ALTER TABLE "recycleBin" ADD COLUMN IF NOT EXISTS data TEXT`);
            await client.query(`ALTER TABLE "recycleBin" ADD COLUMN IF NOT EXISTS "deletedAt" TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS "riderSettlements" (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS rider TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS from_date TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS to_date TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS orders INTEGER`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS earnings TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS bonus REAL`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS fine REAL`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS advance REAL`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS "netPayable" TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS mode TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS date TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS status TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS remarks TEXT`);
            await client.query(`ALTER TABLE "riderSettlements" ADD COLUMN IF NOT EXISTS "settledOrderIds" TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS "restaurantSettlements" (
                    id TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS vendor TEXT`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS from_date TEXT`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS to_date TEXT`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS orders INTEGER`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS "pendingAmount" TEXT`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS "paidAmount" REAL`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS "outstandingAmount" REAL`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS mode TEXT`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS date TEXT`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS status TEXT`);
            await client.query(`ALTER TABLE "restaurantSettlements" ADD COLUMN IF NOT EXISTS remarks TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS "auditLog" (
                    id SERIAL PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE "auditLog" ADD COLUMN IF NOT EXISTS date TEXT`);
            await client.query(`ALTER TABLE "auditLog" ADD COLUMN IF NOT EXISTS time TEXT`);
            await client.query(`ALTER TABLE "auditLog" ADD COLUMN IF NOT EXISTS "user" TEXT`);
            await client.query(`ALTER TABLE "auditLog" ADD COLUMN IF NOT EXISTS action TEXT`);
            await client.query(`ALTER TABLE "auditLog" ADD COLUMN IF NOT EXISTS details TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS "dayCloseHistory" (
                    date TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE "dayCloseHistory" ADD COLUMN IF NOT EXISTS "totalOrders" INTEGER`);
            await client.query(`ALTER TABLE "dayCloseHistory" ADD COLUMN IF NOT EXISTS "totalSales" REAL`);
            await client.query(`ALTER TABLE "dayCloseHistory" ADD COLUMN IF NOT EXISTS "totalProfit" REAL`);
            await client.query(`ALTER TABLE "dayCloseHistory" ADD COLUMN IF NOT EXISTS "totalExpenses" REAL`);
            await client.query(`ALTER TABLE "dayCloseHistory" ADD COLUMN IF NOT EXISTS "netProfit" REAL`);
            await client.query(`ALTER TABLE "dayCloseHistory" ADD COLUMN IF NOT EXISTS "closedBy" TEXT`);
            await client.query(`ALTER TABLE "dayCloseHistory" ADD COLUMN IF NOT EXISTS "closedAt" TEXT`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS counters (
                    name TEXT PRIMARY KEY
                )
            `);
            await client.query(`ALTER TABLE counters ADD COLUMN IF NOT EXISTS val INTEGER`);

            // Useful Indexes (columns guaranteed to exist by the ALTER statements above)
            await client.query(`CREATE INDEX IF NOT EXISTS idx_entries_orderid ON entries("orderId")`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_restaurants_name ON restaurants(name)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)`);

            // Default Inserts with ON CONFLICT DO NOTHING
            await client.query(`
                INSERT INTO counters (name, val) VALUES ('orderCounter', 1)
                ON CONFLICT (name) DO NOTHING
            `);

            await client.query(`
                INSERT INTO counters (name, val) VALUES ('expenseCounter', 1)
                ON CONFLICT (name) DO NOTHING
            `);

            // SECURITY NOTE: this seeds a default super-admin account
            // ('Naav' / DEFAULT_ADMIN_PASSWORD, falling back to the
            // existing '9972' default) exactly once — the ON CONFLICT (id)
            // DO NOTHING below means this INSERT is a no-op on every boot
            // after the very first one, so setting DEFAULT_ADMIN_PASSWORD
            // later will NOT retroactively change an already-created
            // admin's password (no breaking change for existing
            // deployments). If this app is already live, change the
            // 'Naav' account's password from the app itself (or rotate it
            // directly in the database) — shipping a hardcoded default
            // credential in source control is a known attack vector once
            // a repo/image is anything less than fully private.
            const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || '9972';
            const hashedPassword = await bcrypt.hash(defaultAdminPassword, 10);
            await client.query(`
                INSERT INTO administrators (id, "fullName", username, password, mobile, email, role, status, "createdDate", "modifiedDate", "lastLogin", "lastLogout", "createdBy", remarks) 
                VALUES ('ADM-DEFAULT', 'Naav', 'Naav', $1, '9999999999', 'naav@admin.com', 'Super Administrator', 'Active', $2, '-', '-', '-', 'System', 'Default Super Admin')
                ON CONFLICT (id) DO NOTHING
            `, [hashedPassword, new Date().toISOString()]);

            await client.query(`
                INSERT INTO settings (key, value) VALUES ('companyName', 'NAAV ACCOUNTS')
                ON CONFLICT (key) DO NOTHING
            `);

            await client.query(`
                INSERT INTO settings (key, value) VALUES ('customCategories', '[]')
                ON CONFLICT (key) DO NOTHING
            `);

            await client.query(`
                INSERT INTO settings (key, value) VALUES ('lastBackupDate', 'Never')
                ON CONFLICT (key) DO NOTHING
            `);

            await client.query('COMMIT');
            console.log('PostgreSQL tables, indexes, and default data initialized successfully.');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error initializing PostgreSQL tables:');
        console.error(err);
        throw err;
    }
}

module.exports = {
    initTables
};
