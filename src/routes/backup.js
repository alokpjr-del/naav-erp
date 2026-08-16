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

// GET /api/backup/status — View Backup System Status, Size, Counts
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
