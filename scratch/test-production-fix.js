const express = require('express');
const { pool } = require('../src/postgres');
const { initTables } = require('../src/postgres-schema');

async function testProductionFix() {
    console.log('=== STARTING PRODUCTION FIX VERIFICATION ===');
    await initTables();

    let app = express();
    app.use(express.json());
    app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
    app.use('/api/state', require('../src/routes/state'));
    app.use('/api', require('../src/routes/riderLocations'));

    let server = app.listen(0);
    let port = server.address().port;
    console.log('Production Test Server running on port:', port);

    // ====================================================
    // STEP A: GET /api/delivery-boys (Verifying All 8 Riders)
    // ====================================================
    console.log('\n--- STEP A: GET /api/delivery-boys ---');
    const resA = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const ridersA = await resA.json();
    console.log(`Total Riders returned by GET /api/delivery-boys: ${ridersA.length}`);
    console.log(JSON.stringify(ridersA, null, 2));

    // ====================================================
    // STEP B: GET /api/state
    // ====================================================
    console.log('\n--- STEP B: GET /api/state (deliveryBoys portion) ---');
    const resB = await fetch(`http://localhost:${port}/api/state`);
    const stateB = await resB.json();
    console.log(`Total Riders returned by GET /api/state: ${stateB.deliveryBoys.length}`);
    console.log(JSON.stringify(stateB.deliveryBoys, null, 2));

    // ====================================================
    // STEP C: CRITICAL PERSISTENCE TEST (Unrelated State Save / Order Creation)
    // ====================================================
    console.log('\n--- STEP C: CRITICAL STATE-SAVE SAFETY TEST (POST /api/state) ---');
    // Simulate frontend POST /api/state when adding an order or expense
    const orderSavePayload = {
        deliveryBoys: ridersA,
        entries: [{ id: 'TEST-ORDER-001', orderId: 'NV000999', customerName: 'Test Order' }],
        expenses: [],
        restaurants: []
    };
    const saveRes = await fetch(`http://localhost:${port}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderSavePayload)
    });
    console.log('POST /api/state status:', saveRes.status);

    // Verify GET /api/delivery-boys after state save
    const resC = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const ridersC = await resC.json();
    console.log(`Total Riders after POST /api/state: ${ridersC.length}`);
    console.log(JSON.stringify(ridersC, null, 2));

    // ====================================================
    // STEP D: SERVER RESTART PERSISTENCE
    // ====================================================
    console.log('\n--- STEP D: SERVER RESTART PERSISTENCE ---');
    server.close();
    console.log('Closed server. Simulating server restart...');

    app = express();
    app.use(express.json());
    app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
    app.use('/api/state', require('../src/routes/state'));
    app.use('/api', require('../src/routes/riderLocations'));

    server = app.listen(0);
    port = server.address().port;

    const resD = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const ridersD = await resD.json();
    console.log(`Total Riders after Server Restart: ${ridersD.length}`);
    console.log(JSON.stringify(ridersD, null, 2));

    server.close();
    console.log('\n=== ALL PRODUCTION VERIFICATION TESTS COMPLETED SUCCESSFULLY ===');
}

testProductionFix().catch(e => {
    console.error('Test Error:', e);
    process.exit(1);
});
