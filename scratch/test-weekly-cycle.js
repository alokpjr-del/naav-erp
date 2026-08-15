const express = require('express');
const { pool } = require('../src/postgres');
const { initTables } = require('../src/postgres-schema');

// Mirror getNAAVWeekRange from public/index.html
function getNAAVWeekRange(inputDate) {
    let d;
    if (!inputDate) {
        d = new Date();
    } else if (typeof inputDate === 'string') {
        const norm = inputDate.trim();
        const parts = norm.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
            d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else {
            d = new Date(inputDate);
        }
    } else {
        d = new Date(inputDate);
    }

    if (isNaN(d.getTime())) {
        d = new Date();
    }

    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const followingMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);

    const formatDateStr = (dateObj) => {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const formatDisplayDate = (dateObj) => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const mmm = months[dateObj.getMonth()];
        const yyyy = dateObj.getFullYear();
        return `${dd}-${mmm}-${yyyy}`;
    };

    return {
        startDate: formatDateStr(monday),
        endDate: formatDateStr(sunday),
        settlementDate: formatDateStr(followingMonday),
        formattedStartDate: formatDisplayDate(monday),
        formattedEndDate: formatDisplayDate(sunday),
        formattedSettlementDate: formatDisplayDate(followingMonday),
        formattedPeriod: `${formatDisplayDate(monday)} → ${formatDisplayDate(sunday)}`
    };
}

async function runWeeklyTests() {
    console.log('=== STARTING NAAV WEEKLY CYCLE TESTS ===');

    // 1. Test Monday 10-Aug-2026
    const t1 = getNAAVWeekRange('2026-08-10');
    console.log('1. Monday (2026-08-10):', t1);
    if (t1.startDate !== '2026-08-10' || t1.endDate !== '2026-08-16' || t1.settlementDate !== '2026-08-17') {
        throw new Error('Test 1 failed!');
    }

    // 2. Test Tuesday 11-Aug-2026
    const t2 = getNAAVWeekRange('2026-08-11');
    console.log('2. Tuesday (2026-08-11):', t2);
    if (t2.startDate !== '2026-08-10' || t2.endDate !== '2026-08-16' || t2.settlementDate !== '2026-08-17') {
        throw new Error('Test 2 failed!');
    }

    // 3. Test Saturday 15-Aug-2026
    const t3 = getNAAVWeekRange('2026-08-15');
    console.log('3. Saturday (2026-08-15):', t3);
    if (t3.startDate !== '2026-08-10' || t3.endDate !== '2026-08-16' || t3.settlementDate !== '2026-08-17') {
        throw new Error('Test 3 failed!');
    }

    // 4. Test Sunday 16-Aug-2026
    const t4 = getNAAVWeekRange('2026-08-16');
    console.log('4. Sunday (2026-08-16):', t4);
    if (t4.startDate !== '2026-08-10' || t4.endDate !== '2026-08-16' || t4.settlementDate !== '2026-08-17') {
        throw new Error('Test 4 failed!');
    }

    // 5. Test Following Monday 17-Aug-2026
    const t5 = getNAAVWeekRange('2026-08-17');
    console.log('5. Following Monday (2026-08-17):', t5);
    if (t5.startDate !== '2026-08-17' || t5.endDate !== '2026-08-23' || t5.settlementDate !== '2026-08-24') {
        throw new Error('Test 5 failed!');
    }

    // 6. Test Historical Week 03-Aug-2026
    const t6 = getNAAVWeekRange('2026-08-03');
    console.log('6. Historical Week (2026-08-03):', t6);
    if (t6.startDate !== '2026-08-03' || t6.endDate !== '2026-08-09' || t6.settlementDate !== '2026-08-10') {
        throw new Error('Test 6 failed!');
    }

    // 7. Verify Historical Orders mapping to Monday-Sunday weeks
    await initTables();
    const resOrders = await pool.query(`SELECT id, "orderId", date, vendor, "vendorRate", profit FROM entries ORDER BY date DESC;`);
    console.log('\n--- Existing Historical Orders in Database & Week Ranges ---');
    resOrders.rows.forEach(o => {
        const week = getNAAVWeekRange(o.date);
        console.log(`Order ${o.orderId || o.id} (Date: ${o.date}) -> Belongs to Week: ${week.startDate} to ${week.endDate} (Settlement: ${week.settlementDate})`);
    });

    console.log('\n=== ALL WEEKLY CYCLE TESTS COMPLETED SUCCESSFULLY ===');
    process.exit(0);
}

runWeeklyTests().catch(e => {
    console.error('Weekly Test Failed:', e);
    process.exit(1);
});
