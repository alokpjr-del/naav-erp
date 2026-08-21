const express = require('express');
const router = express.Router();
const { pool } = require('../postgres');
const { getAuthenticatedRiderSession } = require('./riderLocations');

// Helper to map DB row snake_case to camelCase JSON
function formatOrderResponse(row) {
    if (!row) return null;
    return {
        orderId: row.order_id,
        riderId: row.rider_id,
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
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
        pickedUpAt: row.picked_up_at ? new Date(row.picked_up_at).toISOString() : null,
        deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null
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
            deliveryCharge
        } = req.body || {};

        if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
            return res.status(400).json({ success: false, error: 'orderId is required.' });
        }
        if (!riderId || typeof riderId !== 'string' || !riderId.trim()) {
            return res.status(400).json({ success: false, error: 'riderId is required.' });
        }

        const foodAmountNum = Number(foodAmount || 0);
        const deliveryChargeNum = Number(deliveryCharge || 0);

        if (isNaN(foodAmountNum) || foodAmountNum < 0) {
            return res.status(400).json({ success: false, error: 'foodAmount must be a valid non-negative number.' });
        }
        if (isNaN(deliveryChargeNum) || deliveryChargeNum < 0) {
            return res.status(400).json({ success: false, error: 'deliveryCharge must be a valid non-negative number.' });
        }

        // STRICT ACCOUNTING ENFORCEMENT (Server-side computed ONLY)
        const totalAmount = foodAmountNum + deliveryChargeNum;
        const riderEarning = deliveryChargeNum;

        const result = await pool.query(
            `INSERT INTO rider_orders (
                order_id, rider_id, customer_name, customer_mobile, from_location, to_location,
                food_amount, delivery_charge, total_amount, rider_earning, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'NEW', NOW())
            ON CONFLICT (order_id) DO UPDATE SET
                rider_id = EXCLUDED.rider_id,
                customer_name = EXCLUDED.customer_name,
                customer_mobile = EXCLUDED.customer_mobile,
                from_location = EXCLUDED.from_location,
                to_location = EXCLUDED.to_location,
                food_amount = EXCLUDED.food_amount,
                delivery_charge = EXCLUDED.delivery_charge,
                total_amount = EXCLUDED.total_amount,
                rider_earning = EXCLUDED.rider_earning
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
                riderEarning
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
        const { status, riderId } = req.query || {};
        let queryText = `SELECT * FROM rider_orders WHERE 1=1`;
        const queryParams = [];

        if (riderId && typeof riderId === 'string' && riderId.trim()) {
            queryParams.push(riderId.trim());
            queryText += ` AND rider_id = $${queryParams.length}`;
        }

        if (status && typeof status === 'string' && status.trim() && status.toUpperCase() !== 'ALL') {
            queryParams.push(status.trim().toUpperCase());
            queryText += ` AND UPPER(status) = $${queryParams.length}`;
        }

        queryText += ` ORDER BY created_at DESC`;

        const result = await pool.query(queryText, queryParams);
        const orders = result.rows.map(formatOrderResponse);

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

// GET /api/rider-orders - List assigned orders for authenticated rider
router.get('/rider-orders', async (req, res) => {
    try {
        const session = await getAuthenticatedRiderSession(req);
        if (!session || !session.riderId) {
            return res.status(401).json({ success: false, error: 'Unauthorized rider session.', code: 'SESSION_REVOKED' });
        }

        const { status } = req.query || {};
        let queryText = `SELECT * FROM rider_orders WHERE rider_id = $1`;
        const queryParams = [session.riderId];

        if (status && typeof status === 'string' && status.trim()) {
            const statusList = status.split(',').map(s => s.trim().toUpperCase());
            queryText += ` AND UPPER(status) = ANY($2)`;
            queryParams.push(statusList);
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

        const updateResult = await pool.query(
            `UPDATE rider_orders
             SET status = 'ACCEPTED', accepted_at = NOW()
             WHERE order_id = $1
             RETURNING *`,
            [id]
        );

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

        const updateResult = await pool.query(
            `UPDATE rider_orders
             SET status = 'DELIVERED',
                 payment_mode = $1,
                 rider_earning = $2,
                 delivered_at = NOW()
             WHERE order_id = $3
             RETURNING *`,
            [normalizedPayment, verifiedEarning, id]
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
