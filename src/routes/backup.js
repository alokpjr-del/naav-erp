const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
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

// GET /api/backup/download/latest — Admin Stream Download Latest Backup File
router.get('/download/latest', async (req, res) => {
    try {
        const status = await getBackupStatus();
        if (!status.lastBackup || !status.lastBackup.filePath || !fs.existsSync(status.lastBackup.filePath)) {
            return res.status(404).json({ success: false, error: 'No backup file available for download.' });
        }

        const filename = status.lastBackup.filename;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        fs.createReadStream(status.lastBackup.filePath).pipe(res);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/backup/download/:filename — Download Specific Historical Backup File
router.get('/download/:filename', async (req, res) => {
    try {
        const safeFilename = path.basename(req.params.filename);
        const filePath = path.join(BACKUP_DIR, safeFilename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Requested backup file not found.' });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        fs.createReadStream(filePath).pipe(res);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/backup/restore — Admin Manual Restore with Confirmation & Emergency Pre-Backup
router.post('/restore', async (req, res) => {
    try {
        const { backupPayload, confirmRestore } = req.body;

        if (!confirmRestore) {
            return res.status(400).json({
                success: false,
                error: 'RESTORE REJECTED: You must explicitly confirm restoration by setting confirmRestore: true.'
            });
        }

        if (!backupPayload) {
            return res.status(400).json({ success: false, error: 'RESTORE REJECTED: Backup payload JSON is required.' });
        }

        const result = await restoreFromBackupPayload(backupPayload, confirmRestore);
        res.json({ success: true, message: 'Database restored safely.', ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
