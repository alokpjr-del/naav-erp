const express = require('express');
const { pool } = require('../src/postgres');
const { initTables } = require('../src/postgres-schema');

async function runStep2() {
    console.log('=== STEP 2: SET PASSWORD AND VERIFY COMPLETE PERSISTENCE & LOGIN ===');
    await initTables();

    let app = express();
    app.use(express.json());
    app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
    app.use('/api/state', require('../src/routes/state'));
    app.use('/api', require('../src/routes/riderLocations'));

    let server = app.listen(0);
    let port = server.address().port;
    console.log('Server listening on port:', port);

    const alokId = 'D-1786009437048';
    const newPassword = 'AlokRiderPassword123';

    // 1. Set Password via POST /api/delivery-boys/set-password
    console.log('\n--- 1. Calling POST /api/delivery-boys/set-password ---');
    const setPassRes = await fetch(`http://localhost:${port}/api/delivery-boys/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: alokId, password: newPassword })
    });
    console.log('Set Password Response:', await setPassRes.json());

    // 2. Call GET /api/delivery-boys immediately after setting password
    console.log('\n--- 2. GET /api/delivery-boys immediately after setting password ---');
    const get1 = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const riders1 = await get1.json();
    const alok1 = riders1.find(r => r.id === alokId);
    console.log('Alok Record 1:', alok1);

    // 3. Simulate state save (POST /api/state) as done when saving an order or expense
    console.log('\n--- 3. Simulating POST /api/state (Unrelated ERP action) ---');
    const stateSaveRes = await fetch(`http://localhost:${port}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            deliveryBoys: riders1,
            entries: [{ id: 'TEST-ENTRY-01' }],
            expenses: [],
            restaurants: []
        })
    });
    console.log('POST /api/state status:', stateSaveRes.status);

    // 4. GET /api/delivery-boys after POST /api/state
    console.log('\n--- 4. GET /api/delivery-boys after POST /api/state ---');
    const get2 = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const riders2 = await get2.json();
    const alok2 = riders2.find(r => r.id === alokId);
    console.log('Alok Record 2 (After State Save):', alok2);

    // 5. Simulate browser refresh (GET /api/state)
    console.log('\n--- 5. Simulating F5 Browser Refresh (GET /api/state) ---');
    const stateGet = await fetch(`http://localhost:${port}/api/state`);
    const stateData = await stateGet.json();
    const alokState = stateData.deliveryBoys.find(r => r.id === alokId);
    console.log('Alok Record 3 (After F5 Refresh):', alokState);

    // 6. Simulate Server Process Restart
    console.log('\n--- 6. Simulating Backend Server Process Restart ---');
    server.close();

    app = express();
    app.use(express.json());
    app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
    app.use('/api/state', require('../src/routes/state'));
    app.use('/api', require('../src/routes/riderLocations'));

    server = app.listen(0);
    port = server.address().port;

    const getRestart = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const ridersRestart = await getRestart.json();
    const alokRestart = ridersRestart.find(r => r.id === alokId);
    console.log('Alok Record 4 (After Server Restart):', alokRestart);

    // 7. Test Rider Login by Rider ID (D-1786009437048)
    console.log('\n--- 7. Testing Rider Login by Rider ID ---');
    const loginById = await fetch(`http://localhost:${port}/api/rider-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: alokId, password: newPassword })
    });
    console.log('Login by Rider ID Status:', loginById.status, await loginById.json());

    // 8. Test Rider Login by Mobile Number (8660989327)
    console.log('\n--- 8. Testing Rider Login by Mobile Number ---');
    const loginByMobile = await fetch(`http://localhost:${port}/api/rider-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: '8660989327', password: newPassword })
    });
    console.log('Login by Mobile Status:', loginByMobile.status, await loginByMobile.json());

    // Print Complete Final Response from GET /api/delivery-boys
    console.log('\n--- COMPLETE FINAL GET /api/delivery-boys RESPONSE ---');
    const finalGet = await fetch(`http://localhost:${port}/api/delivery-boys`);
    const finalRiders = await finalGet.json();
    console.log(JSON.stringify(finalRiders, null, 2));

    server.close();
    console.log('\n=== STEP 2 VERIFICATION COMPLETE ===');
}

runStep2().catch(e => { console.error('Step 2 Error:', e); process.exit(1); });
