const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let runtimeRefreshToken = null;
const activeStateTokens = new Set();

function base64UrlEncode(strOrBuffer) {
    const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
    return buf.toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

// Get Redirect URI based on request host or production default
function getRedirectUri(reqHost) {
    if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
        return process.env.GOOGLE_OAUTH_REDIRECT_URI;
    }
    if (reqHost && (reqHost.includes('localhost') || reqHost.includes('127.0.0.1'))) {
        return `http://${reqHost}/api/backup/oauth2callback`;
    }
    return 'https://naav-erp.onrender.com/api/backup/oauth2callback';
}

// Generate OAuth2 Consent Authorization URL with CSRF protection
function getOAuth2AuthUrl(reqHost) {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
        throw new Error('GOOGLE_OAUTH_CLIENT_ID environment variable is missing.');
    }

    const redirectUri = getRedirectUri(reqHost);
    const stateToken = crypto.randomBytes(24).toString('hex');
    activeStateTokens.add(stateToken);

    // Expire state token after 15 minutes
    setTimeout(() => activeStateTokens.delete(stateToken), 15 * 60 * 1000);

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline',
        prompt: 'consent',
        state: stateToken
    });

    return {
        authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        redirectUri
    };
}

// Server-side OAuth2 Callback Code Exchange
async function handleOAuth2Callback(code, state, reqHost) {
    if (!state || !activeStateTokens.has(state)) {
        throw new Error('OAUTH2 CSRF VALIDATION FAILED: Invalid or expired state parameter.');
    }
    activeStateTokens.delete(state);

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET environment variable is missing.');
    }

    const redirectUri = getRedirectUri(reqHost);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
        throw new Error(`OAuth2 Authorization Exchange Failed: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`);
    }

    if (tokenData.refresh_token) {
        runtimeRefreshToken = tokenData.refresh_token;
    }

    return {
        success: true,
        message: 'Google Drive authorization successful. Backup service is now connected to Google Drive.'
    };
}

// Obtain OAuth2 Access Token using Refresh Token
async function getOAuth2AccessToken() {
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN || runtimeRefreshToken;
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!refreshToken || !clientId || !clientSecret) {
        return null;
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`OAuth2 Refresh Token Exchange Failed: ${data.error_description || data.error || res.statusText}`);
    }

    return data.access_token;
}

// Service Account Credentials Fallback Helper
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
                    return { creds: content, secretPath: filePath };
                }
            } catch (e) {}
        }
    }

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
            const content = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
            if (content.client_email && content.private_key) {
                return { creds: content, secretPath: 'ENV_VAR' };
            }
        } catch (e) {}
    }

    return null;
}

// Exchange RS256 Signed JWT for Service Account Token
async function getServiceAccountAccessToken(creds) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/drive.file',
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
        throw new Error(`Service Account Auth Failed: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`);
    }

    return tokenData.access_token;
}

// Main Google Drive Upload Engine (OAuth2 User Auth Primary, Service Account Fallback)
async function uploadBackupToGoogleDrive(filename, contentString) {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1uwr0wW36z1_i1yBvzetAf-TXIXHE8NdL';
    let accessToken = null;
    let authMethod = 'OAuth2 User Authorization';

    try {
        // 1. Attempt OAuth2 Access Token First
        accessToken = await getOAuth2AccessToken();

        // 2. Fallback to Service Account if OAuth2 credentials not set
        if (!accessToken) {
            const saCreds = findServiceAccountCredentials();
            if (saCreds) {
                authMethod = `Service Account Fallback (${saCreds.creds.client_email})`;
                accessToken = await getServiceAccountAccessToken(saCreds.creds);
            }
        }

        if (!accessToken) {
            return {
                success: false,
                status: 'SKIPPED_NO_CREDENTIALS',
                message: 'Google Drive credentials not configured. Using local disk fallback.'
            };
        }

        console.log(`[Google Drive] Authenticated using: ${authMethod}. Target Folder ID: ${folderId}`);

        // Check for duplicate file in target folder
        const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name = '${filename}' and '${folderId}' in parents and trashed = false`)}&fields=files(id,name)`;
        const checkRes = await fetch(checkUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.files && checkData.files.length > 0) {
                console.log(`[Google Drive] File ${filename} already exists in folder ${folderId} (${checkData.files[0].id}). Skipping duplicate upload.`);
                return {
                    success: true,
                    status: 'ALREADY_EXISTS',
                    fileId: checkData.files[0].id,
                    folderId,
                    authMethod
                };
            }
        }

        // Upload file via multipart upload
        console.log(`[Google Drive] Uploading ${filename} to folder ID "${folderId}"...`);
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
            authMethod
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

function setRuntimeRefreshToken(token) {
    runtimeRefreshToken = token;
}

module.exports = {
    getOAuth2AuthUrl,
    handleOAuth2Callback,
    uploadBackupToGoogleDrive,
    setRuntimeRefreshToken,
    findServiceAccountCredentials
};
