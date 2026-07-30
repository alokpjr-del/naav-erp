const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'naav_accounts.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening SQLite database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initTables();
    }
});

function initTables() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS administrators (
            id TEXT PRIMARY KEY,
            fullName TEXT,
            username TEXT UNIQUE,
            password TEXT,
            mobile TEXT,
            email TEXT,
            role TEXT,
            status TEXT,
            createdDate TEXT,
            modifiedDate TEXT,
            lastLogin TEXT,
            lastLogout TEXT,
            createdBy TEXT,
            remarks TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY,
            orderId TEXT,
            date TEXT,
            customerName TEXT,
            customerMobile TEXT,
            customerAddress TEXT,
            vendor TEXT,
            vendorRate REAL,
            location TEXT,
            category TEXT,
            onlineRate REAL,
            percentage REAL,
            deliveryCharge REAL,
            profit REAL,
            deliveryBoy TEXT,
            cash TEXT,
            upi TEXT,
            naavTransferred REAL,
            orderStatus TEXT,
            isSettled INTEGER,
            paidDate TEXT,
            paidTime TEXT,
            paidBy TEXT,
            remarks TEXT,
            timeline TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS restaurants (
            id TEXT PRIMARY KEY,
            name TEXT,
            contactPerson TEXT,
            mobile TEXT,
            altMobile TEXT,
            address TEXT,
            gst TEXT,
            email TEXT,
            openTime TEXT,
            closeTime TEXT,
            status TEXT,
            remarks TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS deliveryBoys (
            id TEXT PRIMARY KEY,
            name TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            expenseId TEXT,
            date TEXT,
            category TEXT,
            expenseName TEXT,
            amount REAL,
            paymentMode TEXT,
            paidTo TEXT,
            refNo TEXT,
            remarks TEXT,
            createdBy TEXT,
            createdDateTime TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS riderSettlements (
            id TEXT PRIMARY KEY,
            rider TEXT,
            from_date TEXT,
            to_date TEXT,
            orders INTEGER,
            earnings TEXT,
            bonus REAL,
            fine REAL,
            advance REAL,
            netPayable TEXT,
            mode TEXT,
            date TEXT,
            status TEXT,
            remarks TEXT,
            settledOrderIds TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS restaurantSettlements (
            id TEXT PRIMARY KEY,
            vendor TEXT,
            from_date TEXT,
            to_date TEXT,
            orders INTEGER,
            pendingAmount TEXT,
            paidAmount REAL,
            outstandingAmount TEXT,
            mode TEXT,
            date TEXT,
            status TEXT,
            remarks TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS auditLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            time TEXT,
            user TEXT,
            action TEXT,
            details TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS dayCloseHistory (
            date TEXT PRIMARY KEY,
            totalOrders INTEGER,
            totalSales REAL,
            totalProfit REAL,
            totalExpenses REAL,
            netProfit REAL,
            closedBy TEXT,
            closedAt TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS counters (
            name TEXT PRIMARY KEY,
            val INTEGER
        )`, () => {
            db.get(`SELECT val FROM counters WHERE name = 'orderCounter'`, (err, row) => {
                if (!row) db.run(`INSERT INTO counters (name, val) VALUES ('orderCounter', 1)`);
            });
            db.get(`SELECT val FROM counters WHERE name = 'expenseCounter'`, (err, row) => {
                if (!row) db.run(`INSERT INTO counters (name, val) VALUES ('expenseCounter', 1)`);
            });
        });

        db.get(`SELECT COUNT(*) as count FROM administrators`, (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO administrators (id, fullName, username, password, mobile, email, role, status, createdDate, modifiedDate, lastLogin, lastLogout, createdBy, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['ADM-DEFAULT', 'Naav', 'Naav', '9972', '9999999999', 'naav@admin.com', 'Super Administrator', 'Active', new Date().toLocaleDateString(), '-', '-', '-', 'System', 'Default Super Admin']
                );
            }
        });

        db.get(`SELECT value FROM settings WHERE key = 'companyName'`, (err, row) => {
            if (!row) {
                db.run(`INSERT INTO settings (key, value) VALUES ('companyName', 'NAAV ACCOUNTS')`);
                db.run(`INSERT INTO settings (key, value) VALUES ('customCategories', '[]')`);
                db.run(`INSERT INTO settings (key, value) VALUES ('lastBackupDate', 'Never')`);
            }
        });
    });
}

module.exports = db;
