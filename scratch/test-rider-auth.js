const express = require('express');
const { pool } = require('../src/postgres');
const { initTables } = require('../src/postgres-schema');
const app = express();
app.use(express.json());
app.use('/api/delivery-boys', require('../src/routes/deliveryBoys'));
app.use('/api', require('../src/routes/riderLocations'));

const server = app.listen(0, async () => {
    const port = server.address().port;
    console.log('Testing Rider Auth on port', port);
    
    // Ensure postgres columns are initialized
    await initTables();

    const riderId = 'RIDER_TEST_01';
    await pool.query(`DELETE FROM "deliveryBoys" WHERE id = $1`, [riderId]);
    await pool.query(`INSERT INTO "deliveryBoys" (id, name, mobile, status) VALUES ($1, $2, $3, $4)`, [riderId, 'Ravi Kumar', '9845123456', 'Active']);
    
    // 1. Set Rider Password
    const setPassRes = await fetch('http://localhost:' + port + '/api/delivery-boys/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId, password: 'RiderSecret123' })
    });
    console.log('1. Set Password:', await setPassRes.json());
    
    // 2. Test Login with WRONG Password
    const wrongLogin = await fetch('http://localhost:' + port + '/api/rider-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: '9845123456', password: 'WrongPassword' })
    });
    console.log('2. Wrong Login Status (401 Expected):', wrongLogin.status, await wrongLogin.json());
    
    // 3. Test Login with CORRECT Password
    const rightLogin = await fetch('http://localhost:' + port + '/api/rider-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: '9845123456', password: 'RiderSecret123' })
    });
    const loginData = await rightLogin.json();
    console.log('3. Correct Login Status (200 Expected):', rightLogin.status, loginData);
    const token = loginData.token;
    
    // 4. Post Location WITHOUT Token
    const noTokenLoc = await fetch('http://localhost:' + port + '/api/rider-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: 13.6268, longitude: 74.6912 })
    });
    console.log('4. Location without Token (401 Expected):', noTokenLoc.status, await noTokenLoc.json());
    
    // 5. Post Location WITH Token & Spoofed ID
    const authedLoc = await fetch('http://localhost:' + port + '/api/rider-location', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ riderId: 'SPOOFED_ID', latitude: 13.626812, longitude: 74.691234, accuracy: 5 })
    });
    const locResult = await authedLoc.json();
    console.log('5. Authed Location Result (Identified as Ravi Kumar):', authedLoc.status, locResult);
    
    // 6. GET /api/rider-locations for Accounts Map
    const mapRes = await fetch('http://localhost:' + port + '/api/rider-locations');
    console.log('6. Accounts Map Locations:', await mapRes.json());
    
    // 7. Test Logout
    const logoutRes = await fetch('http://localhost:' + port + '/api/rider-logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('7. Logout Result:', await logoutRes.json());
    
    // 8. Post Location AFTER Logout
    const postAfterLogout = await fetch('http://localhost:' + port + '/api/rider-location', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ latitude: 13.626812, longitude: 74.691234 })
    });
    console.log('8. Location After Logout (401 Expected):', postAfterLogout.status, await postAfterLogout.json());
    
    await pool.query(`DELETE FROM "deliveryBoys" WHERE id = $1`, [riderId]);
    server.close();
});
