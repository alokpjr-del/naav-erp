const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./src/postgres');
const { initTables } = require('./src/postgres-schema');
const { startBackupScheduler } = require('./src/services/backupService');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS_ORIGIN is optional. If it's not set, behavior is IDENTICAL to
// before (cors() with no options allows any origin) — this only lets you
// opt in to restricting it later via an env var, without touching code.
app.use(cors({
    origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
        : true
}));

// Previously express.json() had no size limit, so a single request could
// hand the server an unbounded body to parse and hold in memory — an easy
// DoS vector, and something that becomes a real risk once /api/state (or
// any route) is exposed on the public internet. 15mb comfortably covers a
// full state-snapshot POST for this app's data volumes while still capping
// worst-case memory use per request.
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/state', require('./src/routes/state'));
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/restaurants', require('./src/routes/restaurants'));
app.use('/api/expenses', require('./src/routes/expenses'));
app.use('/api/reports', require('./src/routes/reports'));
app.use('/api/rider-settlements', require('./src/routes/riderSettlements'));
app.use('/api/restaurant-settlements', require('./src/routes/restaurantSettlements'));
app.use('/api/day-close', require('./src/routes/dayClose'));
app.use('/api/customers', require('./src/routes/customers'));
app.use('/api/delivery-boys', require('./src/routes/deliveryBoys'));
app.use('/api/administrators', require('./src/routes/administrators'));
app.use('/api/audit-log', require('./src/routes/auditLog'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/backup', require('./src/routes/backup'));
app.use('/api', require('./src/routes/riderLocations'));

// A typo'd or removed /api/* route used to silently fall through to the
// SPA catch-all below and get back an HTML page with a 200 status instead
// of a 404 — which looks like "it worked" to fetch()/JSON.parse() callers
// until it breaks in a confusing way. This keeps the SPA catch-all for
// real page routes but gives API callers an honest 404 JSON response.
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler. Express only treats a 4-arg function as error
// middleware. Without this, an error thrown outside a route's own
// try/catch (e.g. a synchronous bug, or a rejected promise in middleware)
// falls through to Express's built-in handler, which by default sends the
// error's stack trace back to the client — leaking internals. This is a
// safety net; it does not change behavior for any route that already
// handles its own errors (all currently-uploaded routes do).
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

async function startServer() {
    // Bind HTTP server IMMEDIATELY on process.env.PORT (or 5000) on 0.0.0.0
    // so Render port scanner detects open port instantly without timing out.
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`NAAV ERP Backend running on port ${PORT}`);
    });

    try {
        await testConnection();
        await initTables();
    } catch (err) {
        console.error('PostgreSQL initialization error during boot:', err.message);
    }

    // Start daily backup scheduler asynchronously AFTER HTTP port is open
    try {
        startBackupScheduler();
    } catch (err) {
        console.error('Backup scheduler startup error:', err.message);
    }
}

startServer();
