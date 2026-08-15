const express = require('express');
const { pool } = require('../src/postgres');
const { initTables } = require('../src/postgres-schema');

async function testStateApi() {
    console.log('=== TESTING GET /api/state DASHBOARD DATA SOURCE ===');
    await initTables();

    const app = express();
    app.use(express.json());
    app.use('/api/state', require('../src/routes/state'));
    app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));

    const server = app.listen(0);
    const port = server.address().port;

    const res = await fetch(`http://localhost:${port}/api/state`);
    console.log('GET /api/state HTTP Status:', res.status);
    const state = await res.json();

    console.log(`state.entries count: ${state.entries.length}`);
    console.log(`state.expenses count: ${state.expenses.length}`);
    console.log(`state.restaurantSettlements count: ${state.restaurantSettlements.length}`);
    console.log(`state.riderSettlements count: ${state.riderSettlements.length}`);
    console.log(`state.deliveryBoys count: ${state.deliveryBoys.length}`);
    console.log(`state.restaurants count: ${state.restaurants.length}`);
    console.log(`state.customers count: ${state.customers.length}`);

    server.close();
    console.log('=== GET /api/state TEST COMPLETED SUCCESSFULLY ===');
    process.exit(0);
}

testStateApi().catch(e => { console.error(e); process.exit(1); });
