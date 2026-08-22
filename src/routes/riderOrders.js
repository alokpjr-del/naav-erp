const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');
const { getAuthenticatedRiderSession, calculateHaversineDistanceKm, riderLocationsStore } = require('./riderLocations');

// INITIALIZE DATABASE TABLES FOR RIDER DAY CLOSE, ADVANCED TRACKING & HISTORICAL ARCHIVE
async function initRiderDayCloseTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rider_day_closes (
                id SERIAL PRIMARY KEY,
                business_date VARCHAR(20) NOT NULL UNIQUE,
                status VARCHAR(20) NOT NULL DEFAULT 'CLOSED',
                total_orders INT NOT NULL DEFAULT 0,
                delivered_orders INT NOT NULL DEFAULT 0,
                pending_orders INT NOT NULL DEFAULT 0,
                total_order_value NUMERIC(12,2) NOT NULL DEFAULT 0,
                rider_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
                cash_collection NUMERIC(12,2) NOT NULL DEFAULT 0,
                upi_collection NUMERIC(12,2) NOT NULL DEFAULT 0,
                rider_breakdown JSONB DEFAULT '[]',
                closed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                closed_by VARCHAR(100) DEFAULT 'Admin'
            )
        `);

        await pool.query(`
            ALTER TABLE rider_orders 
            ADD COLUMN IF NOT EXISTS business_date VARCHAR(20),
            ADD COLUMN IF NOT EXISTS day_close_id INT REFERENCES rider_day_closes(id),
            ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10,2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS pickup_delivery_distance_km NUMERIC(10,2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS accept_latitude NUMERIC(10,7),
            ADD COLUMN IF NOT EXISTS accept_longitude NUMERIC(10,7),
            ADD COLUMN IF NOT EXISTS delivered_latitude NUMERIC(10,7),
            ADD COLUMN IF NOT EXISTS delivered_longitude NUMERIC(10,7),
            ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS expected_delivery_minutes INT DEFAULT 20,
            ADD COLUMN IF NOT EXISTS delivery_duration_minutes INT,
            ADD COLUMN IF NOT EXISTS delay_minutes INT DEFAULT 0
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS rider_order_location_points (
                id SERIAL PRIMARY KEY,
                rider_order_id VARCHAR(100) REFERENCES rider_orders(order_id) ON DELETE CASCADE,
                rider_id VARCHAR(100) NOT NULL,
                latitude NUMERIC(10,7) NOT NULL,
                longitude NUMERIC(10,7) NOT NULL,
                accuracy NUMERIC(8,2),
                recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);

        // Populate business_date for existing rows using created_at in IST (Asia/Kolkata)
        await pool.query(`
            UPDATE rider_orders 
            SET business_date = TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') 
            WHERE business_date IS NULL
        `);

        // Populate assigned_at for existing rows
        await pool.query(`
            UPDATE rider_orders 
            SET assigned_at = created_at 
            WHERE assigned_at IS NULL
        `);
    } catch (err) {
        console.error('Error initializing rider_day_closes & advanced tracking tables:', err);
    }
}
initRiderDayCloseTables();

// Helper to get current IST date string (YYYY-MM-DD)
function getTodayISTDateString(offsetDays = 0) {
    const d = new Date();
    if (offsetDays !== 0) {
        d.setDate(d.getDate() + offsetDays);
    }
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(d);
}

// Helper to determine current OPEN business date
async function getOpenBusinessDate() {
    let todayStr = getTodayISTDateString();
    
    // Check if todayStr is already closed
    const closedCheck = await pool.query(
        `SELECT * FROM rider_day_closes WHERE business_date = $1 AND status = 'CLOSED'`,
        [todayStr]
    );

    if (closedCheck.rows.length > 0) {
        // If today is closed, roll over open business date to tomorrow
        return getTodayISTDateString(1);
    }
    return todayStr;
}

// Helper to map DB row snake_case to camelCase JSON
function formatOrderResponse(row) {
    if (!row) return null;
    return {
        orderId: row.order_id,
        riderId: row.rider_id,
        businessDate: row.business_date || null,
        dayCloseId: row.day_close_id || null,
        customerName: row.customer_name || '',
        customerMobile: row.customer_mobile || '',
        fromLocation: row.from_location || '',
        toLocation: row.to_location || '',
        foodAmount: Number(row.food_amount || 0),
        deliveryCharge: Number(row.delivery_charge || 0),
        totalAmount: Number(row.total_amount || 0),
        riderEarning: Number(row.rider_earning || 0),
        paymentMode: row.payment_mode || null,
        status: row.status || 'NEW',
        distanceKm: Number(row.distance_km || 0),
        pickupDeliveryDistanceKm: Number(row.pickup_delivery_distance_km || 0),
        acceptLatitude: row.accept_latitude !== null ? Number(row.accept_latitude) : null,
        acceptLongitude: row.accept_longitude !== null ? Number(row.accept_longitude) : null,
        deliveredLatitude: row.delivered_latitude !== null ? Number(row.delivered_latitude) : null,
        deliveredLongitude: row.delivered_longitude !== null ? Number(row.delivered_longitude) : null,
        assignedAt: row.assigned_at ? new Date(row.assigned_at).toISOString() : (row.created_at ? new Date(row.created_at).toISOString() : null),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
        pickedUpAt: row.picked_up_at ? new Date(row.picked_up_at).toISOString() : null,
        deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
        expectedDeliveryMinutes: Number(row.expected_delivery_minutes || 20),
        deliveryDurationMinutes: row.delivery_duration_minutes !== null ? Number(row.delivery_duration_minutes) : null,
        delayMinutes: Number(row.delay_minutes || 0)
    };
}

// POST /api/rider-orders - Create & Assign Delivery Order (Admin / ERP / System)
router.post('/rider-orders', async (req, res) => {
    try {
        const {
            orderId,
            riderId,
            customerName,
            customerMobile,
            fromLocation,
            toLocation,
            foodAmount,
            deliveryCharge,
            businessDate,
            expectedDeliveryMinutes
        } = req.body || {};

        if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
            return res.status(400).json({ success: false, error: 'orderId is required.' });
        }
        if (!riderId || typeof riderId !== 'string' || !riderId.trim()) {
            return res.status(400).json({ success: false, error: 'riderId is required.' });
        }

        const foodAmountNum = Number(foodAmount || 0);
        const deliveryChargeNum = Number(deliveryCharge || 0);
        const expectedMins = Number(expectedDeliveryMinutes || 20);

        if (isNaN(foodAmountNum) || foodAmountNum < 0) {
            return res.status(400).json({ success: false, error: 'foodAmount must be a valid non-negative number.' });
        }
        if (isNaN(deliveryChargeNum) || deliveryChargeNum < 0) {
            return res.status(400).json({ success: false, error: 'deliveryCharge must be a valid non-negative number.' });
        }

        // Determine business date (Must belong to an OPEN business day)
        let assignedBusinessDate = (businessDate || '').trim();
        if (!assignedBusinessDate) {
            assignedBusinessDate = await getOpenBusinessDate();
        }

        // Verify assigned business date is not already closed
        const closedCheck = await pool.query(
            `SELECT * FROM rider_day_closes WHERE business_date = $1 AND status = 'CLOSED'`,
            [assignedBusinessDate]
        );

        if (closedCheck.rows.length > 0) {
            // Roll over to next open business date if specified date is closed
            assignedBusinessDate = await getOpenBusinessDate();
        }

        // STRICT ACCOUNTING ENFORCEMENT (Server-side computed ONLY)
        const totalAmount = foodAmountNum + deliveryChargeNum;
        const riderEarning = deliveryChargeNum;

        const result = await pool.query(
            `INSERT INTO rider_orders (
                order_id, rider_id, customer_name, customer_mobile, from_location, to_location,
                food_amount, delivery_charge, total_amount, rider_earning, status, business_date,
                expected_delivery_minutes, assigned_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'NEW', $11, $12, NOW(), NOW())
            ON CONFLICT (order_id) DO UPDATE SET
                rider_id = EXCLUDED.rider_id,
                customer_name = EXCLUDED.customer_name,
                customer_mobile = EXCLUDED.customer_mobile,
                from_location = EXCLUDED.from_location,
                to_location = EXCLUDED.to_location,
                food_amount = EXCLUDED.food_amount,
                delivery_charge = EXCLUDED.delivery_charge,
                total_amount = EXCLUDED.total_amount,
                rider_earning = EXCLUDED.rider_earning,
                business_date = EXCLUDED.business_date,
                expected_delivery_minutes = EXCLUDED.expected_delivery_minutes
            RETURNING *`,
            [
                orderId.trim(),
                riderId.trim(),
                (customerName || '').trim(),
                (customerMobile || '').trim(),
                (fromLocation || '').trim(),
                (toLocation || '').trim(),
                foodAmountNum,
                deliveryChargeNum,
                totalAmount,
                riderEarning,
                assignedBusinessDate,
                expectedMins
            ]
        );

        res.status(201).json({
            success: true,
            order: formatOrderResponse(result.rows[0])
        });
    } catch (err) {
        console.error('Error creating rider order:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-orders-admin - List all rider orders for ERP Admin Dashboard
router.get('/rider-orders-admin', async (req, res) => {
    try {
        const { status, riderId, businessDate, scope, paymentMode } = req.query || {};
        let queryText = `SELECT ro.*, d.name AS rider_name FROM rider_orders ro LEFT JOIN "deliveryBoys" d ON d.id = ro.rider_id WHERE 1=1`;
        const queryParams = [];

        // If no explicit scope or businessDate is specified, default to current open business date
        if (businessDate && typeof businessDate === 'string' && businessDate.trim() && businessDate !== 'ALL') {
            queryParams.push(businessDate.trim());
            queryText += ` AND ro.business_date = $${queryParams.length}`;
        } else if (scope === 'today' || !scope || scope === 'open') {
            const openDate = await getOpenBusinessDate();
            queryParams.push(openDate);
            queryText += ` AND ro.business_date = $${queryParams.length}`;
        }

        if (riderId && typeof riderId === 'string' && riderId.trim() && riderId !== 'ALL') {
            queryParams.push(riderId.trim());
            queryText += ` AND ro.rider_id = $${queryParams.length}`;
        }

        if (status && typeof status === 'string' && status.trim() && status.toUpperCase() !== 'ALL') {
            queryParams.push(status.trim().toUpperCase());
            queryText += ` AND UPPER(ro.status) = $${queryParams.length}`;
        }

        if (paymentMode && typeof paymentMode === 'string' && paymentMode.trim() && paymentMode.toUpperCase() !== 'ALL') {
            queryParams.push(paymentMode.trim().toUpperCase());
            queryText += ` AND UPPER(ro.payment_mode) = $${queryParams.length}`;
        }

        queryText += ` ORDER BY ro.created_at DESC`;

        const result = await pool.query(queryText, queryParams);
        const orders = result.rows.map(row => {
            const formatted = formatOrderResponse(row);
            formatted.riderName = row.rider_name || row.rider_id;
            return formatted;
        });

        res.json({
            success: true,
            count: orders.length,
            orders
        });
    } catch (err) {
        console.error('Error fetching admin rider orders list:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-orders/day-status - Get current business day status & summary
router.get('/rider-orders/day-status', async (req, res) => {
    try {
        const todayIST = getTodayISTDateString();
        const openBusinessDate = await getOpenBusinessDate();

        // Check if todayIST is closed
        const closeCheck = await pool.query(
            `SELECT * FROM rider_day_closes WHERE business_date = $1 AND status = 'CLOSED'`,
            [todayIST]
        );

        const isClosed = closeCheck.rows.length > 0;
        const dayCloseRecord = isClosed ? closeCheck.rows[0] : null;

        // Fetch active orders for the open business date
        const ordersResult = await pool.query(
            `SELECT ro.*, d.name AS rider_name 
             FROM rider_orders ro
             LEFT JOIN "deliveryBoys" d ON d.id = ro.rider_id
             WHERE ro.business_date = $1`,
            [openBusinessDate]
        );

        const orders = ordersResult.rows;
        let deliveredCount = 0;
        let pendingCount = 0;
        let totalOrderValue = 0;
        let riderEarnings = 0;
        let cashCollection = 0;
        let upiCollection = 0;
        let totalDistanceKm = 0;

        const riderMap = {};

        orders.forEach(row => {
            const totAmt = Number(row.total_amount || 0);
            const earnAmt = Number(row.rider_earning || 0);
            const dist = Number(row.distance_km || 0);
            const status = (row.status || 'NEW').toUpperCase();
            const payMode = (row.payment_mode || '').toUpperCase();
            const rId = row.rider_id || 'UNASSIGNED';
            const rName = row.rider_name || rId;

            totalOrderValue += totAmt;

            if (status === 'DELIVERED') {
                deliveredCount++;
                riderEarnings += earnAmt;
                totalDistanceKm += dist;
                if (payMode === 'CASH') cashCollection += totAmt;
                if (payMode === 'UPI') upiCollection += totAmt;
            } else if (status !== 'CANCELLED') {
                pendingCount++;
            }

            if (!riderMap[rId]) {
                riderMap[rId] = {
                    riderId: rId,
                    riderName: rName,
                    totalOrders: 0,
                    deliveredOrders: 0,
                    riderEarnings: 0,
                    totalDistanceKm: 0,
                    cashCollection: 0,
                    upiCollection: 0
                };
            }
            riderMap[rId].totalOrders++;
            if (status === 'DELIVERED') {
                riderMap[rId].deliveredOrders++;
                riderMap[rId].riderEarnings += earnAmt;
                riderMap[rId].totalDistanceKm += dist;
                if (payMode === 'CASH') riderMap[rId].cashCollection += totAmt;
                if (payMode === 'UPI') riderMap[rId].upiCollection += totAmt;
            }
        });

        res.json({
            success: true,
            todayDate: todayIST,
            openBusinessDate,
            isClosed,
            dayCloseRecord,
            summary: {
                businessDate: openBusinessDate,
                totalOrders: orders.length,
                deliveredOrders: deliveredCount,
                pendingOrders: pendingCount,
                totalOrderValue: Number(totalOrderValue.toFixed(2)),
                riderEarnings: Number(riderEarnings.toFixed(2)),
                totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
                cashCollection: Number(cashCollection.toFixed(2)),
                upiCollection: Number(upiCollection.toFixed(2)),
                riderBreakdown: Object.values(riderMap)
            }
        });
    } catch (err) {
        console.error('Error fetching rider day status:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-orders/day-close - Close business day & archive rider orders
router.post('/rider-orders/day-close', async (req, res) => {
    try {
        const { businessDate, closedBy } = req.body || {};
        const targetDate = (businessDate || getTodayISTDateString()).trim();
        const userClosedBy = (closedBy || 'Admin').trim();

        // 1. PREVENT DUPLICATE DAY CLOSE
        const checkExisting = await pool.query(
            `SELECT * FROM rider_day_closes WHERE business_date = $1`,
            [targetDate]
        );

        if (checkExisting.rows.length > 0 && checkExisting.rows[0].status === 'CLOSED') {
            return res.status(400).json({
                success: false,
                error: `${targetDate} is already closed. Duplicate closing record prevented.`,
                record: checkExisting.rows[0]
            });
        }

        // 2. Fetch all rider orders for this business date with rider names
        const ordersResult = await pool.query(
            `SELECT ro.*, d.name AS rider_name 
             FROM rider_orders ro
             LEFT JOIN "deliveryBoys" d ON d.id = ro.rider_id
             WHERE ro.business_date = $1`,
            [targetDate]
        );

        const orders = ordersResult.rows;
        let deliveredCount = 0;
        let pendingCount = 0;
        let totalOrderValue = 0;
        let riderEarnings = 0;
        let cashCollection = 0;
        let upiCollection = 0;

        const riderMap = {};

        orders.forEach(row => {
            const totAmt = Number(row.total_amount || 0);
            const earnAmt = Number(row.rider_earning || 0);
            const status = (row.status || 'NEW').toUpperCase();
            const payMode = (row.payment_mode || '').toUpperCase();
            const rId = row.rider_id || 'UNASSIGNED';
            const rName = row.rider_name || rId;

            totalOrderValue += totAmt;

            if (status === 'DELIVERED') {
                deliveredCount++;
                riderEarnings += earnAmt;
                if (payMode === 'CASH') cashCollection += totAmt;
                if (payMode === 'UPI') upiCollection += totAmt;
            } else if (status !== 'CANCELLED') {
                pendingCount++;
            }

            if (!riderMap[rId]) {
                riderMap[rId] = {
                    riderId: rId,
                    riderName: rName,
                    totalOrders: 0,
                    deliveredOrders: 0,
                    riderEarnings: 0,
                    cashCollection: 0,
                    upiCollection: 0
                };
            }
            riderMap[rId].totalOrders++;
            if (status === 'DELIVERED') {
                riderMap[rId].deliveredOrders++;
                riderMap[rId].riderEarnings += earnAmt;
                if (payMode === 'CASH') riderMap[rId].cashCollection += totAmt;
                if (payMode === 'UPI') riderMap[rId].upiCollection += totAmt;
            }
        });

        const riderBreakdown = Object.values(riderMap);

        // 3. Save Day Close Summary Record
        const insertClose = await pool.query(
            `INSERT INTO rider_day_closes (
                business_date, status, total_orders, delivered_orders, pending_orders,
                total_order_value, rider_earnings, cash_collection, upi_collection,
                rider_breakdown, closed_at, closed_by
            ) VALUES ($1, 'CLOSED', $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
            ON CONFLICT (business_date) DO UPDATE SET
                status = 'CLOSED',
                total_orders = EXCLUDED.total_orders,
                delivered_orders = EXCLUDED.delivered_orders,
                pending_orders = EXCLUDED.pending_orders,
                total_order_value = EXCLUDED.total_order_value,
                rider_earnings = EXCLUDED.rider_earnings,
                cash_collection = EXCLUDED.cash_collection,
                upi_collection = EXCLUDED.upi_collection,
                rider_breakdown = EXCLUDED.rider_breakdown,
                closed_at = NOW(),
                closed_by = EXCLUDED.closed_by
            RETURNING *`,
            [
                targetDate,
                orders.length,
                deliveredCount,
                pendingCount,
                Number(totalOrderValue.toFixed(2)),
                Number(riderEarnings.toFixed(2)),
                Number(cashCollection.toFixed(2)),
                Number(upiCollection.toFixed(2)),
                JSON.stringify(riderBreakdown),
                userClosedBy
            ]
        );

        const dayCloseRecord = insertClose.rows[0];

        // 4. Link all rider_orders for targetDate to dayCloseRecord.id
        await pool.query(
            `UPDATE rider_orders SET day_close_id = $1 WHERE business_date = $2`,
            [dayCloseRecord.id, targetDate]
        );

        res.json({
            success: true,
            message: `Rider Orders for ${targetDate} closed successfully.`,
            record: dayCloseRecord
        });
    } catch (err) {
        console.error('Error closing rider day:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-orders/day-history - List historical closed business days
router.get('/rider-orders/day-history', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM rider_day_closes ORDER BY business_date DESC`
        );
        res.json({
            success: true,
            count: result.rows.length,
            history: result.rows
        });
    } catch (err) {
        console.error('Error fetching rider day history:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-orders-summary - Accounting & Earnings Report for Rider Delivery Orders
router.get('/rider-orders-summary', async (req, res) => {
    try {
        let { riderId, date, period, startDate, endDate, businessDate } = req.query || {};

        // STRICT SECURITY: If request comes with rider JWT token, restrict riderId to authenticated rider ONLY
        const session = await getAuthenticatedRiderSession(req).catch(() => null);
        if (session && session.riderId) {
            riderId = session.riderId;
            if (!date && !startDate && !endDate && !period && !businessDate) {
                period = 'today';
            }
        }

        let queryText = `SELECT * FROM rider_orders WHERE UPPER(status) = 'DELIVERED'`;
        const queryParams = [];

        if (riderId && typeof riderId === 'string' && riderId.trim() && riderId.trim() !== 'ALL') {
            queryParams.push(riderId.trim());
            queryText += ` AND rider_id = $${queryParams.length}`;
        }

        if (businessDate && typeof businessDate === 'string' && businessDate.trim()) {
            queryParams.push(businessDate.trim());
            queryText += ` AND business_date = $${queryParams.length}`;
        } else if (date && typeof date === 'string' && date.trim()) {
            queryParams.push(date.trim());
            queryText += ` AND (business_date = $${queryParams.length} OR DATE(delivered_at AT TIME ZONE 'Asia/Kolkata') = $${queryParams.length})`;
        } else if (period === 'today') {
            const openDate = await getOpenBusinessDate();
            queryParams.push(openDate);
            queryText += ` AND business_date = $${queryParams.length}`;
        } else if (period === 'weekly') {
            queryText += ` AND delivered_at >= NOW() - INTERVAL '7 days'`;
        } else if (period === 'monthly') {
            queryText += ` AND delivered_at >= NOW() - INTERVAL '30 days'`;
        } else if (startDate && endDate) {
            queryParams.push(startDate.trim());
            queryText += ` AND DATE(delivered_at AT TIME ZONE 'Asia/Kolkata') >= $${queryParams.length}`;
            queryParams.push(endDate.trim());
            queryText += ` AND DATE(delivered_at AT TIME ZONE 'Asia/Kolkata') <= $${queryParams.length}`;
        }

        queryText += ` ORDER BY delivered_at DESC`;

        const result = await pool.query(queryText, queryParams);
        const orders = result.rows.map(formatOrderResponse);

        let totalFoodAmount = 0;
        let totalDeliveryCharges = 0;
        let totalAmount = 0;
        let totalRiderEarnings = 0;
        let cashCollection = 0;
        let upiCollection = 0;
        let totalDistanceKm = 0;

        const riderMap = {};

        orders.forEach(o => {
            totalFoodAmount += o.foodAmount;
            totalDeliveryCharges += o.deliveryCharge;
            totalAmount += o.totalAmount;
            totalRiderEarnings += o.riderEarning;
            totalDistanceKm += o.distanceKm;

            if (o.paymentMode === 'CASH') cashCollection += o.totalAmount;
            if (o.paymentMode === 'UPI') upiCollection += o.totalAmount;

            const rId = o.riderId || 'UNASSIGNED';
            if (!riderMap[rId]) {
                riderMap[rId] = {
                    riderId: rId,
                    deliveredOrders: 0,
                    deliveryCharges: 0,
                    totalRiderEarnings: 0,
                    totalDistanceKm: 0,
                    cashCollection: 0,
                    upiCollection: 0,
                    totalOrderAmount: 0
                };
            }
            riderMap[rId].deliveredOrders += 1;
            riderMap[rId].deliveryCharges += o.deliveryCharge;
            riderMap[rId].totalRiderEarnings += o.riderEarning;
            riderMap[rId].totalDistanceKm += o.distanceKm;
            if (o.paymentMode === 'CASH') riderMap[rId].cashCollection += o.totalAmount;
            if (o.paymentMode === 'UPI') riderMap[rId].upiCollection += o.totalAmount;
            riderMap[rId].totalOrderAmount += o.totalAmount;
        });

        res.json({
            success: true,
            count: orders.length,
            deliveredOrdersCount: orders.length,
            totalFoodAmount: Number(totalFoodAmount.toFixed(2)),
            totalDeliveryCharges: Number(totalDeliveryCharges.toFixed(2)),
            totalAmount: Number(totalAmount.toFixed(2)),
            totalRiderEarnings: Number(totalRiderEarnings.toFixed(2)),
            totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
            cashCollection: Number(cashCollection.toFixed(2)),
            upiCollection: Number(upiCollection.toFixed(2)),
            riderBreakdown: Object.values(riderMap),
            orders
        });
    } catch (err) {
        console.error('Error fetching rider orders accounting summary:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-orders/:id/route - Fetch actual tracked route GPS points
router.get('/rider-orders/:id/route', async (req, res) => {
    try {
        const { id } = req.params;
        const orderRes = await pool.query(`SELECT * FROM rider_orders WHERE order_id = $1`, [id]);
        if (orderRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found.' });
        }
        const order = orderRes.rows[0];

        const pointsRes = await pool.query(
            `SELECT id, rider_order_id, latitude, longitude, accuracy, recorded_at
             FROM rider_order_location_points
             WHERE rider_order_id = $1
             ORDER BY recorded_at ASC`,
            [id]
        );

        const points = pointsRes.rows.map(r => ({
            id: r.id,
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            accuracy: Number(r.accuracy || 0),
            recordedAt: r.recorded_at
        }));

        res.json({
            success: true,
            orderId: id,
            status: order.status,
            distanceKm: Number(order.distance_km || 0),
            pickupDeliveryDistanceKm: Number(order.pickup_delivery_distance_km || 0),
            acceptLocation: order.accept_latitude !== null ? { latitude: Number(order.accept_latitude), longitude: Number(order.accept_longitude) } : null,
            deliveredLocation: order.delivered_latitude !== null ? { latitude: Number(order.delivered_latitude), longitude: Number(order.delivered_longitude) } : null,
            pointCount: points.length,
            points,
            message: points.length === 0 ? 'Route data unavailable for this order.' : null
        });
    } catch (err) {
        console.error('Error fetching order route:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-orders/export-csv - Export Rider Orders to CSV Excel format
router.get('/rider-orders/export-csv', async (req, res) => {
    try {
        const { status, riderId, businessDate, paymentMode, startDate, endDate } = req.query || {};
        let queryText = `SELECT ro.*, d.name AS rider_name FROM rider_orders ro LEFT JOIN "deliveryBoys" d ON d.id = ro.rider_id WHERE 1=1`;
        const queryParams = [];

        if (businessDate && businessDate !== 'ALL') {
            queryParams.push(businessDate.trim());
            queryText += ` AND ro.business_date = $${queryParams.length}`;
        }
        if (riderId && riderId !== 'ALL') {
            queryParams.push(riderId.trim());
            queryText += ` AND ro.rider_id = $${queryParams.length}`;
        }
        if (status && status !== 'ALL') {
            queryParams.push(status.trim().toUpperCase());
            queryText += ` AND UPPER(ro.status) = $${queryParams.length}`;
        }
        if (paymentMode && paymentMode !== 'ALL') {
            queryParams.push(paymentMode.trim().toUpperCase());
            queryText += ` AND UPPER(ro.payment_mode) = $${queryParams.length}`;
        }
        if (startDate && endDate) {
            queryParams.push(startDate.trim());
            queryText += ` AND ro.created_at >= $${queryParams.length}::date`;
            queryParams.push(endDate.trim());
            queryText += ` AND ro.created_at <= $${queryParams.length}::date + INTERVAL '1 day'`;
        }

        queryText += ` ORDER BY ro.created_at DESC`;

        const result = await pool.query(queryText, queryParams);

        const rows = result.rows;
        let csv = 'Date,Order ID,Rider Order ID,Rider,Customer,Mobile,From,To,Food Amount,Delivery Charge,Total Amount,Distance KM,Pickup-To-Delivery KM,Assigned Time,Accepted Time,Picked Up Time,Delivered Time,Delivery Duration (min),Expected Duration (min),Delay (min),Status,Payment Mode,Rider Earnings\n';

        rows.forEach(r => {
            const fmtDt = d => d ? `"${new Date(d).toLocaleString('en-IN')}"` : '""';
            const esc = s => `"${String(s || '').replace(/"/g, '""')}"`;

            const dateStr = r.business_date || (r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '');
            const dist = Number(r.distance_km || 0).toFixed(2);
            const pdDist = Number(r.pickup_delivery_distance_km || 0).toFixed(2);
            const duration = r.delivery_duration_minutes !== null ? r.delivery_duration_minutes : '';
            const expected = r.expected_delivery_minutes || 20;
            const delay = r.delay_minutes || 0;

            csv += `${esc(dateStr)},${esc(r.order_id)},${esc(r.order_id)},${esc(r.rider_name || r.rider_id)},${esc(r.customer_name)},${esc(r.customer_mobile)},${esc(r.from_location)},${esc(r.to_location)},${Number(r.food_amount||0).toFixed(2)},${Number(r.delivery_charge||0).toFixed(2)},${Number(r.total_amount||0).toFixed(2)},${dist},${pdDist},${fmtDt(r.assigned_at || r.created_at)},${fmtDt(r.accepted_at)},${fmtDt(r.picked_up_at)},${fmtDt(r.delivered_at)},${duration},${expected},${delay},${esc(r.status)},${esc(r.payment_mode || 'PENDING')},${Number(r.rider_earning||0).toFixed(2)}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Rider_Orders_${getTodayISTDateString()}.csv"`);
        res.send(csv);
    } catch (err) {
        console.error('Error exporting rider orders CSV:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-performance - Rider Performance Dashboard Analytics
router.get('/rider-performance', async (req, res) => {
    try {
        const { riderId, period, startDate, endDate, businessDate } = req.query || {};
        let queryText = `
            SELECT 
                r.id AS rider_id,
                r.name AS rider_name,
                r.mobile AS rider_mobile,
                COUNT(ro.order_id)::int AS total_orders,
                COUNT(CASE WHEN UPPER(ro.status) = 'DELIVERED' THEN 1 END)::int AS delivered_orders,
                COALESCE(SUM(CASE WHEN UPPER(ro.status) = 'DELIVERED' THEN ro.rider_earning ELSE 0 END), 0)::float AS total_rider_earnings,
                COALESCE(SUM(CASE WHEN UPPER(ro.status) = 'DELIVERED' THEN ro.distance_km ELSE 0 END), 0)::float AS total_distance_km,
                COALESCE(AVG(CASE WHEN UPPER(ro.status) = 'DELIVERED' THEN ro.delivery_duration_minutes END), 0)::float AS avg_delivery_time_minutes,
                COUNT(CASE WHEN UPPER(ro.status) = 'DELIVERED' AND COALESCE(ro.delay_minutes, 0) = 0 THEN 1 END)::int AS on_time_deliveries,
                COUNT(CASE WHEN UPPER(ro.status) = 'DELIVERED' AND COALESCE(ro.delay_minutes, 0) > 0 THEN 1 END)::int AS delayed_deliveries,
                COALESCE(SUM(CASE WHEN UPPER(ro.status) = 'DELIVERED' AND ro.payment_mode = 'CASH' THEN ro.total_amount ELSE 0 END), 0)::float AS cash_collection,
                COALESCE(SUM(CASE WHEN UPPER(ro.status) = 'DELIVERED' AND ro.payment_mode = 'UPI' THEN ro.total_amount ELSE 0 END), 0)::float AS upi_collection
            FROM "deliveryBoys" r
            LEFT JOIN rider_orders ro ON ro.rider_id = r.id
        `;

        const queryParams = [];
        const whereClauses = [];

        if (riderId && riderId !== 'ALL') {
            queryParams.push(riderId.trim());
            whereClauses.push(`r.id = $${queryParams.length}`);
        }
        if (businessDate && businessDate !== 'ALL') {
            queryParams.push(businessDate.trim());
            whereClauses.push(`ro.business_date = $${queryParams.length}`);
        } else if (period === 'today') {
            const openDate = await getOpenBusinessDate();
            queryParams.push(openDate);
            whereClauses.push(`ro.business_date = $${queryParams.length}`);
        } else if (period === 'yesterday') {
            const yestDate = getTodayISTDateString(-1);
            queryParams.push(yestDate);
            whereClauses.push(`ro.business_date = $${queryParams.length}`);
        } else if (period === 'weekly') {
            whereClauses.push(`ro.created_at >= NOW() - INTERVAL '7 days'`);
        } else if (period === 'monthly') {
            whereClauses.push(`ro.created_at >= NOW() - INTERVAL '30 days'`);
        } else if (startDate && endDate) {
            queryParams.push(startDate.trim());
            whereClauses.push(`ro.created_at >= $${queryParams.length}::date`);
            queryParams.push(endDate.trim());
            whereClauses.push(`ro.created_at <= $${queryParams.length}::date + INTERVAL '1 day'`);
        }

        if (whereClauses.length > 0) {
            queryText += ` WHERE ` + whereClauses.join(' AND ');
        }

        queryText += ` GROUP BY r.id, r.name, r.mobile ORDER BY total_rider_earnings DESC`;

        const result = await pool.query(queryText, queryParams);

        const list = result.rows.map(row => {
            const del = Number(row.delivered_orders || 0);
            const earn = Number(row.total_rider_earnings || 0);
            const dist = Number(Number(row.total_distance_km || 0).toFixed(2));
            const avgDist = del > 0 ? Number((dist / del).toFixed(2)) : 0;
            const avgTime = Number(Number(row.avg_delivery_time_minutes || 0).toFixed(1));
            const onTime = Number(row.on_time_deliveries || 0);
            const delayed = Number(row.delayed_deliveries || 0);
            const onTimeRate = del > 0 ? Number(((onTime / del) * 100).toFixed(1)) : 100;
            const earningsPerKm = dist > 0 ? Number((earn / dist).toFixed(2)) : 0;

            return {
                riderId: row.rider_id,
                riderName: row.rider_name || row.rider_id,
                riderMobile: row.rider_mobile || '',
                totalOrders: Number(row.total_orders || 0),
                deliveredOrders: del,
                totalRiderEarnings: earn,
                totalDistanceKm: dist,
                avgDistancePerOrderKm: avgDist,
                avgDeliveryTimeMinutes: avgTime,
                onTimeDeliveries: onTime,
                delayedDeliveries: delayed,
                onTimeRatePercent: onTimeRate,
                earningsPerKm,
                cashCollection: Number(row.cash_collection || 0),
                upiCollection: Number(row.upi_collection || 0)
            };
        });

        res.json({
            success: true,
            count: list.length,
            performance: list
        });
    } catch (err) {
        console.error('Error fetching rider performance:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-orders - List assigned orders for authenticated rider
router.get('/rider-orders', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session || !session.riderId) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session.', code: 'SESSION_REVOKED' });
        }

        const { status, date } = req.query || {};
        let queryText = `SELECT * FROM rider_orders WHERE rider_id = $1`;
        const queryParams = [session.riderId];

        if (status && typeof status === 'string' && status.trim()) {
            const statusList = status.split(',').map(s => s.trim().toUpperCase());
            queryParams.push(statusList);
            queryText += ` AND UPPER(status) = ANY($${queryParams.length})`;
        }

        if (date && typeof date === 'string' && date.trim()) {
            queryParams.push(date.trim());
            queryText += ` AND (business_date = $${queryParams.length} OR DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $${queryParams.length})`;
        }

        queryText += ` ORDER BY created_at DESC`;

        const result = await pool.query(queryText, queryParams);
        const orders = result.rows.map(formatOrderResponse);

        res.json({
            success: true,
            riderId: session.riderId,
            count: orders.length,
            orders
        });
    } catch (err) {
        console.error('Error fetching rider orders:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rider-orders/:id - Get single order details for assigned authenticated rider
router.get('/rider-orders/:id', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session || !session.riderId) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session.', code: 'SESSION_REVOKED' });
        }

        const { id } = req.params;
        const result = await pool.query(`SELECT * FROM rider_orders WHERE order_id = $1`, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found.' });
        }

        const row = result.rows[0];

        // STRICT SECURITY: A rider can access ONLY orders assigned to that rider
        if (row.rider_id !== session.riderId) {
            return res.status(403).json({ success: false, error: 'Access denied. Order is assigned to another rider.' });
        }

        res.json({
            success: true,
            order: formatOrderResponse(row)
        });
    } catch (err) {
        console.error('Error fetching rider order details:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-orders/:id/accept - Accept assigned order
router.post('/rider-orders/:id/accept', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session || !session.riderId) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session.', code: 'SESSION_REVOKED' });
        }

        const { id } = req.params;
        const checkResult = await pool.query(`SELECT * FROM rider_orders WHERE order_id = $1`, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found.' });
        }

        const order = checkResult.rows[0];

        // STRICT SECURITY: Order assignment verification
        if (order.rider_id !== session.riderId) {
            return res.status(403).json({ success: false, error: 'Access denied. Cannot accept order assigned to another rider.' });
        }

        // STATE TRANSITION CHECK
        if (order.status !== 'NEW') {
            return res.status(400).json({ success: false, error: `Cannot accept order. Current order status is '${order.status}'.` });
        }

        // Capture rider's current location on acceptance
        const riderLoc = riderLocationsStore.get(session.riderId) || {};
        const acceptLat = riderLoc.latitude !== undefined ? Number(riderLoc.latitude) : null;
        const acceptLon = riderLoc.longitude !== undefined ? Number(riderLoc.longitude) : null;

        const updateResult = await pool.query(
            `UPDATE rider_orders
             SET status = 'ACCEPTED', accepted_at = NOW(),
                 accept_latitude = $1, accept_longitude = $2,
                 distance_km = 0.00
             WHERE order_id = $3
             RETURNING *`,
            [acceptLat, acceptLon, id]
        );

        if (acceptLat !== null && acceptLon !== null) {
            await pool.query(
                `INSERT INTO rider_order_location_points (rider_order_id, rider_id, latitude, longitude, accuracy, recorded_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [id, session.riderId, acceptLat, acceptLon, Number(riderLoc.accuracy || 0)]
            );
        }

        res.json({
            success: true,
            message: 'Order accepted successfully.',
            order: formatOrderResponse(updateResult.rows[0])
        });
    } catch (err) {
        console.error('Error accepting rider order:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-orders/:id/pickup - Mark order picked up
router.post('/rider-orders/:id/pickup', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session || !session.riderId) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session.', code: 'SESSION_REVOKED' });
        }

        const { id } = req.params;
        const checkResult = await pool.query(`SELECT * FROM rider_orders WHERE order_id = $1`, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found.' });
        }

        const order = checkResult.rows[0];

        // STRICT SECURITY: Order assignment verification
        if (order.rider_id !== session.riderId) {
            return res.status(403).json({ success: false, error: 'Access denied. Cannot update order assigned to another rider.' });
        }

        // STATE TRANSITION CHECK
        if (order.status !== 'ACCEPTED') {
            return res.status(400).json({ success: false, error: `Cannot mark order as picked up. Order status must be 'ACCEPTED'. Current status: '${order.status}'.` });
        }

        const updateResult = await pool.query(
            `UPDATE rider_orders
             SET status = 'PICKED_UP', picked_up_at = NOW()
             WHERE order_id = $1
             RETURNING *`,
            [id]
        );

        res.json({
            success: true,
            message: 'Order picked up successfully.',
            order: formatOrderResponse(updateResult.rows[0])
        });
    } catch (err) {
        console.error('Error marking order picked up:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rider-orders/:id/deliver - Complete delivery with CASH or UPI
router.post('/rider-orders/:id/deliver', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session || !session.riderId) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session.', code: 'SESSION_REVOKED' });
        }

        const { id } = req.params;
        const { paymentMode } = req.body || {};

        // STRICT PAYMENT MODE VALIDATION
        const normalizedPayment = (paymentMode || '').toString().trim().toUpperCase();
        if (normalizedPayment !== 'CASH' && normalizedPayment !== 'UPI') {
            return res.status(400).json({ success: false, error: 'Invalid paymentMode. Payment mode must be strictly CASH or UPI.' });
        }

        const checkResult = await pool.query(`SELECT * FROM rider_orders WHERE order_id = $1`, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found.' });
        }

        const order = checkResult.rows[0];

        // STRICT SECURITY: Order assignment verification
        if (order.rider_id !== session.riderId) {
            return res.status(403).json({ success: false, error: 'Access denied. Cannot deliver order assigned to another rider.' });
        }

        // PREVENT DUPLICATE DELIVERY / DUPLICATE EARNINGS
        if (order.status === 'DELIVERED') {
            return res.status(400).json({
                success: false,
                error: 'Order is already delivered. Duplicate delivery request prevented.',
                order: formatOrderResponse(order)
            });
        }

        // STATE TRANSITION CHECK: Must be PICKED_UP (or ACCEPTED)
        if (order.status !== 'PICKED_UP' && order.status !== 'ACCEPTED') {
            return res.status(400).json({ success: false, error: `Cannot deliver order in status '${order.status}'.` });
        }

        // SERVER-SIDE ACCOUNTING RE-VERIFICATION
        // Rider earning is ALWAYS deliveryCharge (never totalAmount or client provided value)
        const verifiedEarning = Number(order.delivery_charge || 0);

        const riderLoc = riderLocationsStore.get(session.riderId) || {};
        const delLat = riderLoc.latitude !== undefined ? Number(riderLoc.latitude) : null;
        const delLon = riderLoc.longitude !== undefined ? Number(riderLoc.longitude) : null;

        // Calculate delivery duration and delay
        const acceptedTime = order.accepted_at ? new Date(order.accepted_at) : (order.created_at ? new Date(order.created_at) : new Date());
        const nowTime = new Date();
        const durationMinutes = Math.max(1, Math.round((nowTime - acceptedTime) / 60000));
        const expectedMinutes = Number(order.expected_delivery_minutes || 20);
        const delayMinutes = Math.max(0, durationMinutes - expectedMinutes);

        // Calculate straight-line geographic distance between accept_latitude/longitude and delivered_latitude/longitude
        let pickupDelivDist = 0;
        const accLat = order.accept_latitude !== null ? Number(order.accept_latitude) : delLat;
        const accLon = order.accept_longitude !== null ? Number(order.accept_longitude) : delLon;

        if (accLat !== null && accLon !== null && delLat !== null && delLon !== null) {
            pickupDelivDist = Number(calculateHaversineDistanceKm(accLat, accLon, delLat, delLon).toFixed(2));
        }

        const updateResult = await pool.query(
            `UPDATE rider_orders
             SET status = 'DELIVERED',
                 payment_mode = $1,
                 rider_earning = $2,
                 delivered_at = NOW(),
                 delivered_latitude = $3,
                 delivered_longitude = $4,
                 delivery_duration_minutes = $5,
                 delay_minutes = $6,
                 pickup_delivery_distance_km = $7
             WHERE order_id = $8
             RETURNING *`,
            [normalizedPayment, verifiedEarning, delLat, delLon, durationMinutes, delayMinutes, pickupDelivDist, id]
        );

        res.json({
            success: true,
            message: 'Order delivered successfully.',
            order: formatOrderResponse(updateResult.rows[0])
        });
    } catch (err) {
        console.error('Error delivering order:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
