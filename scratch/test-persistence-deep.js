const express = require('express');
const { pool } = require('../src/postgres');
const { initTables } = require('../src/postgres-schema');

async function runTests() {
    console.log('=== STARTING PERSISTENCE DEEP TEST ===');
    await initTables();

    const riderId = 'D-1786009437048'; // Target Alok rider ID

    // Reset rider row
    await pool.query(`DELETE FROM "deliveryBoys" WHERE id = $1`, [riderId]);
    await pool.query(
        `INSERT INTO "deliveryBoys" (id, name, mobile, status) VALUES ($1, $2, $3, $4)`,
        [riderId, 'Alok', null, 'Active']
    );

    let app = express();
    app.use(express.json());
    app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
    app.use('/api/state', require('../src/routes/state'));
    app.use('/api', require('../src/routes/riderLocations'));

    let server = app.listen(0);
    let port = server.address().port;
    console.log('Test Server running on port:', port);

    // ====================================================
    // TEST A: EDIT MOBILE & PERSISTENCE THROUGH POST /api/state & F5
    // ====================================================
    console.log('\n--- TEST A: EDIT MOBILE & PERSISTENCE ---');
    const putRes = await fetch(`http://localhost:${port}/api/delivery-boys/${riderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alok', mobile: '8660989327', status: 'Active' })
    });
    console.log('1. PUT Response:', await putRes.json());

    // Call GET /api/delivery-boys immediately
    const get1 = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const riders1 = await get1.json();
    const alok1 = riders1.find(r => r.id === riderId);
    console.log('2. GET /api/delivery-boys before state save:', alok1);

    // Simulate saveDB() -> POST /api/state
    const statePayload = {
        deliveryBoys: [{ id: riderId, name: 'Alok', mobile: '8660989327', status: 'Active' }],
        entries: [],
        expenses: [],
        restaurants: []
    };
    const stateSaveRes = await fetch(`http://localhost:${port}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statePayload)
    });
    console.log('3. POST /api/state status:', stateSaveRes.status);

    // Simulate F5 refresh -> GET /api/state
    const stateGet1 = await fetch(`http://localhost:${port}/api/state`);
    const stateData1 = await stateGet1.json();
    const alokState1 = stateData1.deliveryBoys.find(r => r.id === riderId);
    console.log('4. GET /api/state after F5 refresh:', alokState1);

    // ====================================================
    // TEST B: SET PASSWORD & PERSISTENCE ACROSS RESTART
    // ====================================================
    console.log('\n--- TEST B: SET PASSWORD & PERSISTENCE ---');
    const passRes = await fetch(`http://localhost:${port}/api/delivery-boys/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId, password: 'AlokPass866' })
    });
    console.log('1. Set Password Result:', await passRes.json());

    // Save DB state (which used to wipe passwordHash!)
    await fetch(`http://localhost:${port}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statePayload)
    });

    // Verify GET /api/delivery-boys after state save
    const get2 = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const riders2 = await get2.json();
    const alok2 = riders2.find(r => r.id === riderId);
    console.log('2. GET /api/delivery-boys after state save -> hasPassword:', alok2.hasPassword);

    // Close server to simulate complete backend restart
    server.close();
    console.log('3. Server process closed. Simulating backend restart...');

    // Spin up fresh server instance
    app = express();
    app.use(express.json());
    app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
    app.use('/api/state', require('../src/routes/state'));
    app.use('/api', require('../src/routes/riderLocations'));

    server = app.listen(0);
    port = server.address().port;
    console.log('Fresh Server instance running on port:', port);

    // Call GET /api/delivery-boys after server restart
    const getRestart = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const ridersRestart = await getRestart.json();
    const alokRestart = ridersRestart.find(r => r.id === riderId);
    console.log('4. GET /api/delivery-boys after SERVER RESTART:', alokRestart);

    // Test Rider Login after restart
    const loginRes = await fetch(`http://localhost:${port}/api/rider-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: '8660989327', password: 'AlokPass866' })
    });
    console.log('5. Rider Login after Server Restart:', loginRes.status, await loginRes.json());

    // ====================================================
    // TEST C: EDIT MOBILE AFTER PASSWORD IS SET
    // ====================================================
    console.log('\n--- TEST C: EDIT MOBILE AFTER PASSWORD IS SET ---');
    const edit2Res = await fetch(`http://localhost:${port}/api/delivery-boys/${riderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alok', mobile: '8660989328', status: 'Active' })
    });
    console.log('1. Edit 2 PUT Response:', await edit2Res.json());

    // Save state again
    await fetch(`http://localhost:${port}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            deliveryBoys: [{ id: riderId, name: 'Alok', mobile: '8660989328', status: 'Active' }],
            entries: [], expenses: [], restaurants: []
        })
    });

    // Refresh state GET /api/state
    const stateGet2 = await fetch(`http://localhost:${port}/api/state`);
    const stateData2 = await stateGet2.json();
    const alokState2 = stateData2.deliveryBoys.find(r => r.id === riderId);
    console.log('2. GET /api/state after Edit 2 & Refresh:', alokState2);

    // Test login with updated mobile
    const login2Res = await fetch(`http://localhost:${port}/api/rider-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: '8660989328', password: 'AlokPass866' })
    });
    console.log('3. Login with Updated Mobile 8660989328:', login2Res.status, await login2Res.json());

    // Cleanup test record
    await pool.query(`DELETE FROM "deliveryBoys" WHERE id = $1`, [riderId]);
    server.close();
    console.log('\n=== ALL PERSISTENCE TESTS COMPLETED SUCCESSFULY ===');
}

runTests().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
