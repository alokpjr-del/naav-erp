const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    createDatabaseBackup,
    getBackupStatus,
    restoreFromBackupPayload,
    BACKUP_DIR
} = require('../services/backupService');
const {
    getOAuth2AuthUrl,
    handleOAuth2Callback
} = require('../services/googleDriveService');

// GET /api/backup/status — View Backup System Status, Size, Counts
router.get('/status', async (req, res) => {
    try {
        const status = await getBackupStatus();
        res.json({ success: true, ...status });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/backup/auth-url — Generate Google Drive Authorization URL
router.get('/auth-url', (req, res) => {
    try {
        const host = req.get('host');
        const authData = getOAuth2AuthUrl(host);
        res.json({ success: true, authUrl: authData.authUrl, redirectUri: authData.redirectUri });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/backup/oauth2callback — Google OAuth2 Authorization Callback
router.get('/oauth2callback', async (req, res) => {
    try {
        // SAFE Diagnostic Query Audit (NO secret values, codes, or token values logged)
        const queryKeys = Object.keys(req.query || {});
        const stateRaw = req.query ? req.query.state : undefined;
        const stateType = typeof stateRaw;
        const stateIsArray = Array.isArray(stateRaw);
        const stateStr = stateIsArray ? stateRaw[0] : String(stateRaw || '');
        const stateHash = crypto.createHash('sha256').update(stateStr).digest('hex');

        const rawStateMatches = (req.url || '').match(/[?&]state=([^&]*)/g) || [];
        const numStateParamsInUrl = rawStateMatches.length;

        console.log(`[OAuth2 Callback Audit] Query Keys: [${queryKeys.join(', ')}], State Type: ${stateType}, Is Array: ${stateIsArray}, State Str Len: ${stateStr.length}, State SHA-256: ${stateHash}, Num State Params In URL: ${numStateParamsInUrl}`);

        const { code, state, error } = req.query;
        if (error) {
            return res.status(400).send(`<h3>Google Drive Authorization Denied</h3><p>${error}</p>`);
        }

        if (!code || !state) {
            return res.status(400).send('<h3>Authorization Error</h3><p>Missing authorization code or state parameter.</p>');
        }

        const host = req.get('host');
        const result = await handleOAuth2Callback(code, state, host);

        // Safe HTML response displaying NO secret tokens
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Google Drive Authorization Success</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #1e293b; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 500px; text-align: center; border: 1px solid #334155; }
                    h2 { color: #38bdf8; margin-top: 0; }
                    p { line-height: 1.6; color: #94a3b8; }
                    .badge { background: #0284c7; color: white; padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; display: inline-block; margin-bottom: 1rem; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="badge">NAAV ACCOUNTS BACKUP</div>
                    <h2>Google Drive Authorization Successful</h2>
                    <p>${result.message}</p>
                    <p style="font-size: 0.9rem; color: #64748b;">All automated and manual backups will now upload directly to your <code>NAAV BACKUPS</code> folder.</p>
                </div>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send(`<h3>Authorization Failed</h3><p>${e.message}</p>`);
    }
});

// POST /api/backup/now — Admin Manual "Backup Now" Trigger
router.post('/now', async (req, res) => {
    try {
        const backupInfo = await createDatabaseBackup();
        res.json({ success: true, backup: backupInfo });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/backup/download/latest — Download Latest Local Backup
router.get('/download/latest', (req, res) => {
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            return res.status(404).json({ success: false, error: 'No backups exist on disk.' });
        }
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('naav_accounts_backup_') && f.endsWith('.json'))
            .sort().reverse();
        if (files.length === 0) {
            return res.status(404).json({ success: false, error: 'No backup files found.' });
        }
        const latestPath = path.join(BACKUP_DIR, files[0]);
        res.download(latestPath, files[0]);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/backup/restore — Safe Admin Restore Trigger
router.post('/restore', async (req, res) => {
    try {
        const { backup, confirmRestore } = req.body;
        if (!backup) {
            return res.status(400).json({ success: false, error: 'Backup JSON payload is required.' });
        }
        const result = await restoreFromBackupPayload(backup, confirmRestore);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

module.exports = router;
