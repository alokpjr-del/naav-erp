const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function base64UrlEncode(strOrBuffer) {
    const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
    return buf.toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

// Locate Service Account Key File / Environment Variable
function findServiceAccountCredentials() {
    const candidates = [
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
        process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
        process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
        '/etc/secrets/google-service-account.json',
        '/etc/secrets/service-account.json',
        '/etc/secrets/naav-accounts-backup.json',
        '/etc/secrets/key.json',
        '/etc/secrets/naav-backup.json',
        path.join(__dirname, '..', '..', 'secrets', 'google-service-account.json'),
        path.join(__dirname, '..', '..', 'secrets', 'naav-backup.json'),
        path.join(__dirname, '..', '..', 'google-service-account.json')
    ].filter(Boolean);

    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
            try {
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (content.client_email && content.private_key) {
                    return { source: `Secret File: ${filePath}`, creds: content, secretPath: filePath };
                }
            } catch (e) {}
        }
    }

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
            const content = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
            if (content.client_email && content.private_key) {
                return { source: 'Environment Variable: GOOGLE_SERVICE_ACCOUNT_JSON', creds: content, secretPath: 'ENV_VAR' };
            }
        } catch (e) {}
    }

    return null;
}

// Exchange RS256 Signed JWT for Google OAuth2 Access Token
async function getGoogleAccessToken(creds) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
    const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer.sign(creds.private_key, 'base64');
    const encodedSignature = signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const jwt = `${signatureInput}.${encodedSignature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
        throw new Error(`Google Auth Failed: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`);
    }

    return tokenData.access_token;
}

// Find or Create Google Drive Folder "NAAV BACKUPS"
async function getOrCreateBackupFolder(accessToken, folderName = 'NAAV BACKUPS') {
    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
        return process.env.GOOGLE_DRIVE_FOLDER_ID;
    }

    // Search for existing folder
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}&fields=files(id,name)`;
    const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
            return searchData.files[0].id;
        }
    }

    // Create new folder if not found
    console.log(`Creating new Google Drive folder: "${folderName}"...`);
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
        throw new Error(`Failed to create Google Drive folder "${folderName}": ${createData.error?.message || createRes.statusText}`);
    }

    return createData.id;
}

// Upload Backup File to Google Drive "NAAV BACKUPS" Folder
async function uploadBackupToGoogleDrive(filename, contentString) {
    const credsInfo = findServiceAccountCredentials();
    if (!credsInfo) {
        return {
            success: false,
            status: 'SKIPPED_NO_CREDENTIALS',
            message: 'Google service account key file not found in /etc/secrets/ or env var.'
        };
    }

    try {
        console.log(`[Google Drive] Authenticating service account: ${credsInfo.creds.client_email}`);
        const accessToken = await getGoogleAccessToken(credsInfo.creds);

        const folderName = process.env.GOOGLE_DRIVE_FOLDER_NAME || 'NAAV BACKUPS';
        const folderId = await getOrCreateBackupFolder(accessToken, folderName);

        // Check for duplicate file
        const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name = '${filename}' and '${folderId}' in parents and trashed = false`)}&fields=files(id,name)`;
        const checkRes = await fetch(checkUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.files && checkData.files.length > 0) {
                console.log(`[Google Drive] File ${filename} already exists in Google Drive folder "${folderName}" (${checkData.files[0].id}). Skipping duplicate upload.`);
                return {
                    success: true,
                    status: 'ALREADY_EXISTS',
                    fileId: checkData.files[0].id,
                    folderId,
                    folderName,
                    serviceAccount: credsInfo.creds.client_email
                };
            }
        }

        // Upload new file via multipart upload
        console.log(`[Google Drive] Uploading ${filename} to Google Drive folder "${folderName}" (${folderId})...`);
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const metadata = {
            name: filename,
            parents: [folderId],
            mimeType: 'application/json'
        };

        const multipartBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            contentString +
            closeDelimiter;

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
            throw new Error(`Google Drive Upload Failed: ${uploadData.error?.message || uploadRes.statusText}`);
        }

        console.log(`[Google Drive] Upload Success! File ID: ${uploadData.id}`);

        return {
            success: true,
            status: 'SUCCESS',
            fileId: uploadData.id,
            folderId,
            folderName,
            serviceAccount: credsInfo.creds.client_email,
            secretPathUsed: credsInfo.secretPath
        };
    } catch (e) {
        console.error('[Google Drive Upload Error]:', e.message);
        return {
            success: false,
            status: 'FAILED',
            error: e.message
        };
    }
}

module.exports = {
    findServiceAccountCredentials,
    uploadBackupToGoogleDrive
};
