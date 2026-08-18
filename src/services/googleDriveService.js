const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let runtimeRefreshToken = null;
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function base64UrlEncode(strOrBuffer) {
    const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
    return buf.toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
}

function getCharCategory(ch) {
    if (/[A-Za-z0-9]/.test(ch)) return 'alphaNum';
    if (ch === '-') return 'dash';
    if (ch === '_') return 'underscore';
    if (ch === '%') return 'percent';
    if (ch === '=') return 'equals';
    if (ch === '+') return 'plus';
    if (ch === '/') return 'slash';
    if (ch === ':') return 'colon';
    if (ch === '.') return 'dot';
    if (ch === '?') return 'question';
    if (ch === '&') return 'amp';
    if (/\s/.test(ch)) return 'whitespace';
    return 'otherSpecial';
}

// SAFE Helper for Detailed Structural Diagnostics (NO secret values or tokens logged)
function getStateDetailedDiagnostics(stateInput, req) {
    const stateStr = Array.isArray(stateInput) ? String(stateInput[0] || '') : String(stateInput || '');
    const stateSha256 = crypto.createHash('sha256').update(stateStr).digest('hex');

    const alphaNumCount = (stateStr.match(/[A-Za-z0-9]/g) || []).length;
    const dashCount = (stateStr.match(/-/g) || []).length;
    const underscoreCount = (stateStr.match(/_/g) || []).length;
    const percentCount = (stateStr.match(/%/g) || []).length;
    const equalsCount = (stateStr.match(/=/g) || []).length;
    const plusCount = (stateStr.match(/\+/g) || []).length;
    const slashCount = (stateStr.match(/\//g) || []).length;
    const colonCount = (stateStr.match(/:/g) || []).length;
    const dotCount = (stateStr.match(/\./g) || []).length;
    const questionCount = (stateStr.match(/\?/g) || []).length;
    const ampCount = (stateStr.match(/&/g) || []).length;
    const whitespaceCount = (stateStr.match(/\s/g) || []).length;
    const nonBase64UrlCount = (stateStr.match(/[^A-Za-z0-9_-]/g) || []).length;
    const percentEscapesCount = (stateStr.match(/%[0-9a-fA-F]{2}/g) || []).length;
    const isEntirelyBase64Url = /^[A-Za-z0-9_-]+$/.test(stateStr);

    const first3Categories = stateStr.slice(0, 3).split('').map(getCharCategory);
    const last3Categories = stateStr.slice(-3).split('').map(getCharCategory);

    let base64DecodedByteLength = null;
    try {
        let clean = stateStr.replace(/-/g, '+').replace(/_/g, '/');
        while (clean.length % 4) clean += '=';
        const buf = Buffer.from(clean, 'base64');
        base64DecodedByteLength = buf.length;
    } catch (e) {}

    return {
        reqUrlLen: req ? (req.url || '').length : null,
        reqOriginalUrlLen: req ? (req.originalUrl || '').length : null,
        stateLen: stateStr.length,
        stateSha256,
        charCounts: {
            alphaNum: alphaNumCount,
            dash: dashCount,
            underscore: underscoreCount,
            percent: percentCount,
            equals: equalsCount,
            plus: plusCount,
            slash: slashCount,
            colon: colonCount,
            dot: dotCount,
            question: questionCount,
            amp: ampCount,
            whitespace: whitespaceCount
        },
        first3Categories,
        last3Categories,
        nonBase64UrlCount,
        percentEscapesCount,
        isEntirelyBase64Url,
        base64DecodedByteLength
    };
}

// Get Redirect URI based on environment variable, request host, or production default (naavaccount.onrender.com)
function getRedirectUri(reqHost) {
    if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
        return process.env.GOOGLE_OAUTH_REDIRECT_URI;
    }
    if (reqHost) {
        if (reqHost.includes('localhost') || reqHost.includes('127.0.0.1')) {
            return `http://${reqHost}/api/backup/oauth2callback`;
        }
        return `https://${reqHost}/api/backup/oauth2callback`;
    }
    return 'https://naavaccount.onrender.com/api/backup/oauth2callback';
}

// Get HMAC Signing Secret for Stateless CSRF Protection
// Dedicated environment variable: GOOGLE_OAUTH_STATE_SECRET
function getHMACSecret(overrideSecret) {
    if (overrideSecret && typeof overrideSecret === 'string' && overrideSecret.trim().length > 0) {
        return overrideSecret.trim();
    }
    const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
    if (secret && typeof secret === 'string' && secret.trim().length > 0) {
        return secret.trim();
    }
    return null;
}

// Generate Cryptographically Signed Stateless OAuth2 CSRF State Token (Valid for 10 minutes)
function generateOAuthState(overrideSecret) {
    const secret = getHMACSecret(overrideSecret);
    if (!secret) {
        throw new Error('GOOGLE_OAUTH_STATE_SECRET environment variable is missing. Please configure GOOGLE_OAUTH_STATE_SECRET in Render Environment Variables.');
    }

    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${timestamp}.${nonce}`;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');

    const rawState = `${payload}.${signature}`;
    const encodedState = base64UrlEncode(rawState);

    // SAFE SHA-256 Hash Diagnostic Logging (NO secret values or state tokens logged)
    const secretSource = overrideSecret ? 'OVERRIDE_SECRET' : 'GOOGLE_OAUTH_STATE_SECRET';
    const stateSha256 = crypto.createHash('sha256').update(encodedState).digest('hex');
    console.log(`[OAuth2 State Audit] [GENERATE] Secret Source: ${secretSource}, Secret Length: ${secret.length}, HMAC Alg: sha256, Output State Len: ${encodedState.length}, State SHA-256: ${stateSha256}`);

    return encodedState;
}

// Safe Helper to Parse State from URL, Base64Url, or Raw dot-separated formats
function parseOAuthState(rawStateInput) {
    if (!rawStateInput) {
        return null;
    }

    // Handle array if query string contains multiple state parameters
    let rawState = Array.isArray(rawStateInput) ? rawStateInput[0] : rawStateInput;
    if (typeof rawState !== 'string') {
        rawState = String(rawState);
    }

    let str = rawState.trim();

    // 1. Try URL decoding recursively if percentage encoded
    try {
        let decodeLimit = 3;
        while (str.includes('%') && decodeLimit > 0) {
            str = decodeURIComponent(str);
            decodeLimit--;
        }
    } catch (e) {}

    // 2. Try Base64Url decode
    let decodedStr = str;
    try {
        if (!str.includes('.')) {
            decodedStr = base64UrlDecode(str);
        }
    } catch (e) {}

    // 3. Try dot-separated split: timestamp.nonce.signature
    let parts = decodedStr.split('.');
    if (parts.length === 3) {
        return {
            timestampStr: parts[0],
            nonce: parts[1],
            receivedSignature: parts[2],
            rawFormat: 'dot_separated',
            segmentLens: { timestampLen: parts[0].length, nonceLen: parts[1].length, signatureLen: parts[2].length }
        };
    }

    // 4. Try dot-separated split on original string if Base64Url decode produced wrong format
    parts = str.split('.');
    if (parts.length === 3) {
        return {
            timestampStr: parts[0],
            nonce: parts[1],
            receivedSignature: parts[2],
            rawFormat: 'raw_dot_separated',
            segmentLens: { timestampLen: parts[0].length, nonceLen: parts[1].length, signatureLen: parts[2].length }
        };
    }

    return null;
}

// Verify Cryptographic Signature and Expiry of OAuth2 CSRF State Token
function verifyOAuthState(stateInput, overrideSecret, req) {
    const secret = getHMACSecret(overrideSecret);
    const secretSource = overrideSecret ? 'OVERRIDE_SECRET' : 'GOOGLE_OAUTH_STATE_SECRET';
    const secretConfigured = !!secret;

    if (!secret) {
        console.warn('[OAuth2 State Audit] [VERIFY] Validation Failed: GOOGLE_OAUTH_STATE_SECRET is not configured.');
        return { valid: false, reason: 'GOOGLE_OAUTH_STATE_SECRET environment variable is missing. Please configure GOOGLE_OAUTH_STATE_SECRET in Render Environment Variables.' };
    }

    if (!stateInput) {
        console.warn('[OAuth2 State Audit] [VERIFY] Validation Failed: Missing state parameter.');
        return { valid: false, reason: 'Missing state parameter.' };
    }

    const stateStr = Array.isArray(stateInput) ? String(stateInput[0] || '') : String(stateInput || '');
    const diag = getStateDetailedDiagnostics(stateInput, req);

    const parsed = parseOAuthState(stateInput);
    const timestampValid = parsed ? !isNaN(parseInt(parsed.timestampStr, 10)) : false;
    const sigLen = parsed && parsed.receivedSignature ? parsed.receivedSignature.length : 0;
    const secretLen = secret ? secret.length : 0;
    const segmentLens = parsed ? parsed.segmentLens : null;

    if (!parsed) {
        console.log(`[OAuth2 State Audit] [VERIFY] Secret Source: ${secretSource}, Secret Configured: YES, Secret Length: ${secretLen}, HMAC Alg: sha256, Diag: ${JSON.stringify(diag)}, Parsed Segments: 0, Timestamp Valid: false, Recv Sig Len: 0`);
        return { valid: false, reason: 'Invalid state parameter format.' };
    }

    const { timestampStr, nonce, receivedSignature } = parsed;

    // 1. Compute expected HMAC signature first using the exact same secret
    const payload = `${timestampStr}.${nonce}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    // SAFE SHA-256 Hash Diagnostic Logging (NO secret values or state tokens logged)
    console.log(`[OAuth2 State Audit] [VERIFY] Secret Source: ${secretSource}, Secret Configured: YES, Secret Length: ${secretLen}, HMAC Alg: sha256, Diag: ${JSON.stringify(diag)}, SegmentLens: ${JSON.stringify(segmentLens)}, Parsed Segments: 3, Timestamp Valid: ${timestampValid}, Recv Sig Len: ${sigLen}, Expected Sig Len: ${expectedSignature.length}`);

    // Timing-safe signature comparison
    const sigBuffer = Buffer.from(receivedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { valid: false, reason: 'Tampered state parameter or invalid signature.' };
    }

    // 2. Verify timestamp and expiry (10 minutes max lifetime)
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
        return { valid: false, reason: 'Invalid state timestamp.' };
    }

    const age = Date.now() - timestamp;
    if (age < 0 || age > STATE_TTL_MS) {
        return { valid: false, reason: 'OAuth2 state parameter has expired (max lifetime: 10 minutes).' };
    }

    return { valid: true };
}

// Generate OAuth2 Consent Authorization URL with Signed CSRF Protection
function getOAuth2AuthUrl(reqHost) {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
        throw new Error('GOOGLE_OAUTH_CLIENT_ID environment variable is missing.');
    }

    const redirectUri = getRedirectUri(reqHost);
    const stateToken = generateOAuthState();

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline',
        prompt: 'consent',
        state: stateToken
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    const parsedUrl = new URL(authUrl);
    const stateParamsCount = parsedUrl.searchParams.getAll('state').length;
    const authUrlStateParam = parsedUrl.searchParams.get('state');
    const authUrlStateSha256 = crypto.createHash('sha256').update(authUrlStateParam).digest('hex');

    console.log(`[OAuth2 State Audit] [AUTH-URL] AuthUrl Host/Path: ${parsedUrl.hostname}${parsedUrl.pathname}, State Params Count: ${stateParamsCount}, State Param Len: ${authUrlStateParam.length}, State SHA-256: ${authUrlStateSha256}`);

    return {
        authUrl,
        redirectUri
    };
}

// Server-side OAuth2 Callback Code Exchange
async function handleOAuth2Callback(code, state, reqHost, req) {
    const verification = verifyOAuthState(state, undefined, req);
    if (!verification.valid) {
        throw new Error(`OAUTH2 CSRF VALIDATION FAILED: ${verification.reason}`);
    }

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
    generateOAuthState,
    verifyOAuthState,
    getOAuth2AuthUrl,
    handleOAuth2Callback,
    uploadBackupToGoogleDrive,
    setRuntimeRefreshToken,
    findServiceAccountCredentials
};
