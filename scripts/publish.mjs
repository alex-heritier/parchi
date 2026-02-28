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
 * Required environment variables (set in .env.publish or shell):
 *
 *   Chrome Web Store:
 *     CWS_EXTENSION_ID   – 32-char extension ID from Chrome Developer Dashboard
 *     CWS_CLIENT_ID      – OAuth 2.0 client ID (Google Cloud Console)
 *     CWS_CLIENT_SECRET   – OAuth 2.0 client secret
 *     CWS_REFRESH_TOKEN   – long-lived refresh token (via `npx chrome-webstore-upload-keys`)
 *
 *   Firefox Add-ons:
 *     AMO_JWT_ISSUER      – API key from https://addons.mozilla.org/en-US/developers/addon/api/key/
 *     AMO_JWT_SECRET      – API secret from the same page
 *     AMO_CHANNEL         – "listed" (default) or "unlisted"
 *
 * Setup guide:
 *
 *   Chrome Web Store (one-time):
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
  const { CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN } = process.env;

  if (!CWS_EXTENSION_ID || !CWS_CLIENT_ID || !CWS_CLIENT_SECRET || !CWS_REFRESH_TOKEN) {
    console.error(
      '⚠️  Chrome Web Store credentials missing. Set these env vars (or in .env.publish):\n' +
        '   CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN\n' +
        '   See header comment in scripts/publish.mjs for setup steps.\n',
    );
    if (!doFirefox) process.exit(1);
  } else {
    console.log('🚀 Uploading to Chrome Web Store...');
    const chromeZip = path.join(root, `parchi-${version}-chrome.zip`);
    try {
      run(
        `npx chrome-webstore-upload-cli upload --source "${chromeZip}" ` +
          `--extension-id ${CWS_EXTENSION_ID} ` +
          `--client-id ${CWS_CLIENT_ID} ` +
          `--client-secret ${CWS_CLIENT_SECRET} ` +
          `--refresh-token ${CWS_REFRESH_TOKEN}`,
      );
      console.log('📢 Publishing to Chrome Web Store...');
      run(
        `npx chrome-webstore-upload-cli publish ` +
          `--extension-id ${CWS_EXTENSION_ID} ` +
          `--client-id ${CWS_CLIENT_ID} ` +
          `--client-secret ${CWS_CLIENT_SECRET} ` +
          `--refresh-token ${CWS_REFRESH_TOKEN}`,
      );
      console.log('  ✓ Chrome Web Store: submitted for review\n');
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
      `npx web-ext sign ` +
        `--channel=${channel} ` +
        `--source-dir=dist-firefox ` +
        `--artifacts-dir=dist-firefox ` +
        `--api-key=${AMO_JWT_ISSUER} ` +
        `--api-secret=${AMO_JWT_SECRET}` +
        metaFlag +
        ` --approval-timeout=0`,
    );
    console.log(`  ✓ Firefox Add-ons: submitted (${channel})\n`);
  } catch (err) {
    console.error('  ✗ Firefox Add-ons publish failed:', err.message, '\n');
  }
}

console.log('🏁 Done.\n');
