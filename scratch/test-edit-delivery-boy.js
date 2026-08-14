const express = require('express');
const { pool } = require('../src/postgres');
const { initTables } = require('../src/postgres-schema');
const app = express();
app.use(express.json());
app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
app.use('/api', require('../src/routes/riderLocations'));

const server = app.listen(0, async () => {
    const port = server.address().port;
    console.log('Testing Edit Delivery Boy Flow on port', port);
    
    await initTables();

    const riderId1 = 'D-1786723522603'; // Alok
    const riderId2 = 'D-1786999999999'; // Second test rider

    // Clean up test rows
    await pool.query(`DELETE FROM "deliveryBoys" WHERE id IN ($1, $2)`, [riderId1, riderId2]);

    // Insert initial Alok rider without mobile
    await pool.query(
        `INSERT INTO "deliveryBoys" (id, name, mobile, status) VALUES ($1, $2, $3, $4)`,
        [riderId1, 'Alok', null, 'Active']
    );

    // Set initial password for Alok
    await fetch('http://localhost:' + port + '/api/delivery-boys/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: riderId1, password: 'AlokPass123' })
    });

    // 1. Edit Alok -> Enter Mobile 9876543210
    const editRes1 = await fetch('http://localhost:' + port + '/api/delivery-boys/' + riderId1, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alok', mobile: '9876543210', status: 'Active' })
    });
    console.log('1. Edit Alok Mobile Result:', await editRes1.json());

    // 2. Fetch all delivery boys to verify mobile appears
    const listRes1 = await fetch('http://localhost:' + port + '/api/delivery-boys');
    const riders = await listRes1.json();
    const alokRider = riders.find(r => r.id === riderId1);
    console.log('2. Alok in Directory:', alokRider);

    // 3. Test duplicate mobile check with second rider
    await pool.query(
        `INSERT INTO "deliveryBoys" (id, name, mobile, status) VALUES ($1, $2, $3, $4)`,
        [riderId2, 'Rider Two', null, 'Active']
    );
    const dupRes = await fetch('http://localhost:' + port + '/api/delivery-boys/' + riderId2, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Rider Two', mobile: '9876543210', status: 'Active' })
    });
    console.log('3. Duplicate Mobile Check (400 Expected):', dupRes.status, await dupRes.json());

    // 4. Test Login using Rider ID (D-1786723522603)
    const loginById = await fetch('http://localhost:' + port + '/api/rider-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: riderId1, password: 'AlokPass123' })
    });
    console.log('4. Login by Rider ID Status:', loginById.status, await loginById.json());

    // 5. Test Login using new Mobile Number (9876543210)
    const loginByMobile = await fetch('http://localhost:' + port + '/api/rider-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: '9876543210', password: 'AlokPass123' })
    });
    const mobLoginData = await loginByMobile.json();
    console.log('5. Login by Mobile Status:', loginByMobile.status, mobLoginData);

    // 6. Test Location Tracking with Mobile Login Token
    const token = mobLoginData.token;
    const locRes = await fetch('http://localhost:' + port + '/api/rider-location', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ latitude: 13.626812, longitude: 74.691234, accuracy: 4.5 })
    });
    console.log('6. Location Tracking for Alok:', locRes.status, await locRes.json());

    // Clean up test rows
    await pool.query(`DELETE FROM "deliveryBoys" WHERE id IN ($1, $2)`, [riderId1, riderId2]);
    server.close();
});
