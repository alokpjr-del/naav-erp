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

// GET /api/backup/status — View Local PostgreSQL Backup System Status, Size, Counts
router.get('/status', async (req, res) => {
    try {
        const status = await getBackupStatus();
        res.json({ success: true, ...status });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
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
