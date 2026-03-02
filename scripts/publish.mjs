#!/usr/bin/env node
/**
 * Publish Parchi extension to Chrome Web Store and/or Firefox Add-ons (AMO).
 *
 * Usage:
 *   node scripts/publish.mjs                  # publish to both stores
 *   node scripts/publish.mjs --chrome         # Chrome Web Store only
 *   node scripts/publish.mjs --firefox        # Firefox Add-ons only
 *   node scripts/publish.mjs --dry-run        # build ZIPs only, skip upload
 *
 * Required environment variables (set in .env.publish or .env.local or shell):
 *
 *   Chrome Web Store (Option A - Service Account):
 *     CWS_EXTENSION_ID    – 32-char extension ID from Chrome Developer Dashboard
 *     CWS_SERVICE_ACCOUNT_KEY – service account JSON, base64 JSON, or path to key file
 *     CWS_PUBLISHER_ID    – numeric publisher ID from Chrome Web Store Developer Dashboard
 *
 *   Chrome Web Store (Option B - OAuth 2.0):
 *     CWS_EXTENSION_ID   – 32-char extension ID from Chrome Developer Dashboard
 *     CWS_CLIENT_ID      – OAuth 2.0 client ID (Google Cloud Console)
 *     CWS_CLIENT_SECRET  – OAuth 2.0 client secret
 *     CWS_REFRESH_TOKEN  – long-lived refresh token (via `npx chrome-webstore-upload-keys`)
 *
 *   Firefox Add-ons:
 *     AMO_JWT_ISSUER      – API key from https://addons.mozilla.org/en-US/developers/addon/api/key/
 *     AMO_JWT_SECRET      – API secret from the same page
 *     AMO_CHANNEL         – "listed" (default) or "unlisted"
 *
 * Setup guide:
 *
 *   Chrome Web Store - Service Account:
 *     1. Create service account at IAM Console (https://www.googleapis.com/iam)
 *     2. Download JSON key file and grant this service account access in Chrome Web Store developer dashboard
 *     3. Find extension ID and publisher ID at https://chrome.google.com/webstore/devconsole
 *     4. Set CWS_EXTENSION_ID, CWS_PUBLISHER_ID and CWS_SERVICE_ACCOUNT_KEY env vars
 *
 *   Chrome Web Store - OAuth 2.0 (legacy):
 *     1. Go to https://console.cloud.google.com/apis/credentials
 *     2. Create OAuth 2.0 Client ID (Desktop app type)
 *     3. Enable Chrome Web Store API at:
 *        https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com
 *     4. Run: npx chrome-webstore-upload-keys
 *        (enter client ID + secret, authorize in browser, get refresh token)
 *     5. Find extension ID at https://chrome.google.com/webstore/devconsole
 *
 *   Firefox Add-ons (one-time):
 *     1. Go to https://addons.mozilla.org/en-US/developers/addon/api/key/
 *     2. Generate credentials → copy JWT Issuer + JWT Secret
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ── Parse args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const chromeOnly = args.includes('--chrome');
const firefoxOnly = args.includes('--firefox');
const dryRun = args.includes('--dry-run');
const doChrome = !firefoxOnly;
const doFirefox = !chromeOnly;

// ── Load .env.publish if it exists ────────────────────────────────────
const envFile = path.join(root, '.env.publish');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Read version ──────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
console.log(`\n📦 Parchi v${version}\n`);

// ── Build ─────────────────────────────────────────────────────────────
const run = (cmd, opts = {}) => {
  console.log(`  → ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
};

const runCapture = (cmd, opts = {}) =>
  execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', cwd: root, ...opts }).trim();

const toBase64Url = (value) =>
  Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const createServiceAccountToken = (serviceAccount) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const tokenRaw = runCapture(
    `curl -sS -X POST "${payload.aud}" ` +
      '-H "Content-Type: application/x-www-form-urlencoded" ' +
      `--data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" ` +
      `--data-urlencode "assertion=${jwt}"`,
  );

  let tokenData;
  try {
    tokenData = JSON.parse(tokenRaw);
  } catch {
    throw new Error(`Unable to parse OAuth token response: ${tokenRaw}`);
  }
  if (!tokenData.access_token) {
    throw new Error(`Service account token request failed: ${tokenData.error || tokenRaw}`);
  }
  return tokenData.access_token;
};

const parseJsonOrThrow = (label, raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} returned non-JSON response: ${raw.slice(0, 300)}`);
  }
};

const toCurlJsonData = (obj) => `'${JSON.stringify(obj).replace(/'/g, "'\\''")}'`;

const parseServiceAccountInput = (rawValue) => {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) throw new Error('CWS_SERVICE_ACCOUNT_KEY is empty');

  const tryParseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const inlineJson = tryParseJson(trimmed);
  if (inlineJson) return inlineJson;

  const resolvedPath = path.isAbsolute(trimmed) ? trimmed : path.join(root, trimmed);
  if (fs.existsSync(resolvedPath)) {
    const fileJson = tryParseJson(fs.readFileSync(resolvedPath, 'utf8'));
    if (fileJson) return fileJson;
    throw new Error(`Service account key file is not valid JSON: ${resolvedPath}`);
  }

  let decodedBase64 = null;
  try {
    decodedBase64 = Buffer.from(trimmed, 'base64').toString('utf8');
  } catch {
    decodedBase64 = null;
  }
  if (decodedBase64) {
    const base64Decoded = tryParseJson(decodedBase64);
    if (base64Decoded) return base64Decoded;
  }

  throw new Error('CWS_SERVICE_ACCOUNT_KEY must be a JSON object, JSON file path, or base64-encoded JSON');
};

const uploadChromeViaServiceAccount = ({ extensionId, serviceAccountInput, zipPath, publisherId }) => {
  const serviceAccount = parseServiceAccountInput(serviceAccountInput);
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Invalid service account key: missing client_email/private_key');
  }

  const accessToken = createServiceAccountToken(serviceAccount);
  const itemName = `publishers/${publisherId}/items/${extensionId}`;
  const uploadRaw = runCapture(
    `curl -sS -X POST "https://chromewebstore.googleapis.com/upload/v2/${itemName}:upload" ` +
      `-H "Authorization: Bearer ${accessToken}" ` +
      '-H "Content-Type: application/octet-stream" ' +
      `--data-binary @"${zipPath}"`,
  );
  const uploadData = parseJsonOrThrow('Chrome upload', uploadRaw);
  const uploadState = String(uploadData.uploadState || '').toUpperCase();
  if (uploadState && uploadState !== 'SUCCEEDED' && uploadState !== 'IN_PROGRESS') {
    throw new Error(`Chrome upload failed: ${uploadRaw}`);
  }

  const publishRaw = runCapture(
    `curl -sS -X POST "https://chromewebstore.googleapis.com/v2/${itemName}:publish" ` +
      `-H "Authorization: Bearer ${accessToken}" ` +
      '-H "Content-Type: application/json" ' +
      `-d ${toCurlJsonData({ publishType: 'DEFAULT_PUBLISH' })}`,
  );
  const publishData = parseJsonOrThrow('Chrome publish', publishRaw);
  if (publishData.error) {
    throw new Error(`Chrome publish failed: ${publishRaw}`);
  }

  const state = String(publishData.state || 'UNKNOWN');
  return { state, itemName };
};

if (doChrome) {
  console.log('🔨 Building Chrome extension...');
  run('node scripts/build.mjs');
  const chromeZip = path.join(root, `parchi-${version}-chrome.zip`);
  run(`cd dist && zip -r "${chromeZip}" . -x '*.map' 'tests/*' 'tests/**/*'`);
  console.log(`  ✓ ${path.basename(chromeZip)}\n`);
}

if (doFirefox) {
  console.log('🔨 Building Firefox extension...');
  run('BROWSER=firefox node scripts/build.mjs');
  run('node scripts/build-firefox-xpi.mjs');
  const xpiName = `parchi-${version}.xpi`;
  console.log(`  ✓ dist-firefox/${xpiName}\n`);
}

if (dryRun) {
  console.log('🏁 Dry run complete — ZIPs built, skipping upload.\n');
  process.exit(0);
}

// ── Publish to Chrome Web Store ───────────────────────────────────────
if (doChrome) {
  const {
    CWS_EXTENSION_ID,
    CWS_CLIENT_ID,
    CWS_CLIENT_SECRET,
    CWS_REFRESH_TOKEN,
    CWS_SERVICE_ACCOUNT_KEY,
    CWS_PUBLISHER_ID,
  } = process.env;

  if (!CWS_EXTENSION_ID) {
    console.error(
      '⚠️  Chrome Web Store credentials missing. Set these env vars (or in .env.local/.env.publish):\n' +
        '   Option A (Service Account, preferred):\n' +
        '     CWS_EXTENSION_ID, CWS_SERVICE_ACCOUNT_KEY, CWS_PUBLISHER_ID\n' +
        '   Option B (OAuth 2.0):\n' +
        '     CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN\n' +
        '   See header comment in scripts/publish.mjs for setup steps.\n',
    );
    if (!doFirefox) process.exit(1);
  } else {
    console.log('🚀 Uploading to Chrome Web Store...');
    const chromeZip = path.join(root, `parchi-${version}-chrome.zip`);
    try {
      if (CWS_SERVICE_ACCOUNT_KEY) {
        if (!CWS_PUBLISHER_ID) {
          throw new Error('Service account mode requires CWS_PUBLISHER_ID (Chrome Web Store publisher ID)');
        }
        const { state, itemName } = uploadChromeViaServiceAccount({
          extensionId: CWS_EXTENSION_ID,
          serviceAccountInput: CWS_SERVICE_ACCOUNT_KEY,
          zipPath: chromeZip,
          publisherId: CWS_PUBLISHER_ID,
        });
        console.log(`  ✓ Chrome Web Store: ${itemName} publish state ${state}\n`);
      } else if (CWS_CLIENT_ID && CWS_CLIENT_SECRET && CWS_REFRESH_TOKEN) {
        run(
          'npx chrome-webstore-upload-cli upload --source ' +
            `"${chromeZip}" ` +
            `--extension-id ${CWS_EXTENSION_ID} ` +
            `--client-id ${CWS_CLIENT_ID} ` +
            `--client-secret ${CWS_CLIENT_SECRET} ` +
            `--refresh-token ${CWS_REFRESH_TOKEN}`,
        );
        console.log('📢 Publishing to Chrome Web Store...');
        run(
          'npx chrome-webstore-upload-cli publish ' +
            `--extension-id ${CWS_EXTENSION_ID} ` +
            `--client-id ${CWS_CLIENT_ID} ` +
            `--client-secret ${CWS_CLIENT_SECRET} ` +
            `--refresh-token ${CWS_REFRESH_TOKEN}`,
        );
        console.log('  ✓ Chrome Web Store: submitted for review\n');
      } else {
        throw new Error('Invalid credentials configuration');
      }
    } catch (err) {
      console.error('  ✗ Chrome Web Store publish failed:', err.message, '\n');
    }
  }
}

// ── Publish to Firefox Add-ons ────────────────────────────────────────
if (doFirefox) {
  const { AMO_JWT_ISSUER, AMO_JWT_SECRET, AMO_CHANNEL } = process.env;
  const channel = AMO_CHANNEL || 'listed';

  if (!AMO_JWT_ISSUER || !AMO_JWT_SECRET) {
    console.error(
      '⚠️  Firefox Add-ons credentials missing. Set these env vars (or in .env.publish):\n' +
        '   AMO_JWT_ISSUER, AMO_JWT_SECRET\n' +
        '   Get them at: https://addons.mozilla.org/en-US/developers/addon/api/key/\n',
    );
    process.exit(1);
  }

  console.log(`🚀 Submitting to Firefox Add-ons (channel: ${channel})...`);
  const amoMeta = path.join(root, 'amo-metadata.json');
  const metaFlag = channel === 'listed' && fs.existsSync(amoMeta) ? ` --amo-metadata="${amoMeta}"` : '';
  try {
    run(
      'npx web-ext sign ' +
        `--channel=${channel} ` +
        '--source-dir=dist-firefox ' +
        '--artifacts-dir=dist-firefox ' +
        `--api-key=${AMO_JWT_ISSUER} ` +
        `--api-secret=${AMO_JWT_SECRET}` +
        metaFlag +
        ' --approval-timeout=0',
    );
    console.log(`  ✓ Firefox Add-ons: submitted (${channel})\n`);
  } catch (err) {
    console.error('  ✗ Firefox Add-ons publish failed:', err.message, '\n');
  }
}

console.log('🏁 Done.\n');
