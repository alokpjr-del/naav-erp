const express = require('express');
const { pool } = require('../src/postgres');
const { initTables } = require('../src/postgres-schema');
const app = express();
app.use(express.json());
app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
app.use('/api', require('../src/routes/riderLocations'));

const server = app.listen(0, async () => {
    const port = server.address().port;
    console.log('Testing Edit Delivery Boy Bugfix Suite on port', port);
    
    await initTables();

    const riderId = 'D-1786723522603'; // Alok

    // Reset test row
    await pool.query(`DELETE FROM "deliveryBoys" WHERE id = $1`, [riderId]);
    await pool.query(
        `INSERT INTO "deliveryBoys" (id, name, mobile, status) VALUES ($1, $2, $3, $4)`,
        [riderId, 'Alok', null, 'Active']
    );

    // ====================================================
    // TEST 1 — CANCEL
    // ====================================================
    console.log('--- TEST 1 — CANCEL ---');
    // Verify initial rider state
    const res1 = await fetch('http://localhost:' + port + '/api/delivery-boys');
    const riders1 = await res1.json();
    const initialAlok = riders1.find(r => r.id === riderId);
    console.log('Initial Alok State:', initialAlok);

    // ====================================================
    // TEST 2 — SAVE (WITHOUT PASSWORD PROMPT)
    // ====================================================
    console.log('--- TEST 2 — SAVE ---');
    const saveRes = await fetch('http://localhost:' + port + '/api/delivery-boys/' + riderId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alok', mobile: '9876543210', status: 'Active' })
    });
    console.log('Save Result Status:', saveRes.status, await saveRes.json());

    // ====================================================
    // TEST 3 — REFRESH (GET /api/delivery-boys)
    // ====================================================
    console.log('--- TEST 3 — REFRESH ---');
    const res3 = await fetch('http://localhost:' + port + '/api/delivery-boys');
    const riders3 = await res3.json();
    const updatedAlok3 = riders3.find(r => r.id === riderId);
    console.log('Refreshed Alok in DB:', updatedAlok3);

    // ====================================================
    // TEST 4 — SET PASSWORD (EXPLICIT ADMIN ACTION)
    // ====================================================
    console.log('--- TEST 4 — SET PASSWORD ---');
    const setPassRes = await fetch('http://localhost:' + port + '/api/delivery-boys/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId, password: 'AlokSecret123' })
    });
    console.log('Set Password Result:', await setPassRes.json());

    const res4 = await fetch('http://localhost:' + port + '/api/delivery-boys');
    const riders4 = await res4.json();
    const alok4 = riders4.find(r => r.id === riderId);
    console.log('Alok Password Status:', alok4.hasPassword ? 'Set' : 'Not Set');

    // ====================================================
    // TEST 5 — EDIT AFTER PASSWORD (PASSWORD PRESERVED)
    // ====================================================
    console.log('--- TEST 5 — EDIT AFTER PASSWORD ---');
    const editAfterPassRes = await fetch('http://localhost:' + port + '/api/delivery-boys/' + riderId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alok', mobile: '9876543211', status: 'Active' })
    });
    console.log('Edit After Pass Status:', editAfterPassRes.status, await editAfterPassRes.json());

    const res5 = await fetch('http://localhost:' + port + '/api/delivery-boys');
    const riders5 = await res5.json();
    const alok5 = riders5.find(r => r.id === riderId);
    console.log('Alok after 2nd Edit -> Mobile:', alok5.mobile, '| Password Status:', alok5.hasPassword ? 'Set' : 'Not Set');

    // ====================================================
    // TEST 6 — RIDER LOGIN (BY RIDER ID & BY MOBILE)
    // ====================================================
    console.log('--- TEST 6 — RIDER LOGIN ---');
    const loginById = await fetch('http://localhost:' + port + '/api/rider-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: riderId, password: 'AlokSecret123' })
    });
    console.log('Login by Rider ID Status:', loginById.status, await loginById.json());

    const loginByMobile = await fetch('http://localhost:' + port + '/api/rider-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: '9876543211', password: 'AlokSecret123' })
    });
    const mobLoginData = await loginByMobile.json();
    console.log('Login by Mobile Status:', loginByMobile.status, mobLoginData);

    // ====================================================
    // TEST 7 — GPS LOCATION TRACKING
    // ====================================================
    console.log('--- TEST 7 — GPS LOCATION TRACKING ---');
    const token = mobLoginData.token;
    const locRes = await fetch('http://localhost:' + port + '/api/rider-location', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ latitude: 13.626812, longitude: 74.691234, accuracy: 4.0 })
    });
    console.log('Location Tracking Result:', locRes.status, await locRes.json());

    const mapRes = await fetch('http://localhost:' + port + '/api/rider-locations');
    console.log('NAAV Accounts Live Map Data:', await mapRes.json());

    // Clean up
    await pool.query(`DELETE FROM "deliveryBoys" WHERE id = $1`, [riderId]);
    server.close();
});
