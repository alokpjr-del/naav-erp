const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./src/postgres');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`NAAV ERP Backend running on port ${PORT}`);

    try {
        await testConnection();
    } catch (err) {
        console.error('PostgreSQL connection failed:', err.message);
    }
});