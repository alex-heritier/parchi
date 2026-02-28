#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const shouldFix = process.argv.includes('--fix');

const FILES = [
  path.join(rootDir, 'package.json'),
  path.join(rootDir, 'packages', 'extension', 'manifest.json'),
  path.join(rootDir, 'packages', 'extension', 'manifest.firefox.json'),
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const rel = (filePath) => path.relative(rootDir, filePath);

const run = () => {
  const [packagePath, ...manifestPaths] = FILES;
  const pkg = readJson(packagePath);
  const expectedVersion = String(pkg.version || '').trim();

  if (!expectedVersion) {
    console.error('verify-version-sync: package.json version is empty');
    process.exit(1);
  }

  const mismatches = [];

  manifestPaths.forEach((manifestPath) => {
    const manifest = readJson(manifestPath);
    const version = String(manifest.version || '').trim();
    if (version !== expectedVersion) {
      mismatches.push({ manifestPath, manifest, version });
    }
  });

  if (mismatches.length === 0) {
    console.log(`verify-version-sync: pass (${expectedVersion})`);
    return;
  }

  if (!shouldFix) {
    console.error('verify-version-sync: failed');
    mismatches.forEach(({ manifestPath, version }) => {
      console.error(`- ${rel(manifestPath)} has ${version || '<empty>'}, expected ${expectedVersion}`);
    });
    console.error('run `npm run verify:version-sync:fix` to reconcile versions');
    process.exit(1);
  }

  mismatches.forEach(({ manifestPath, manifest }) => {
    manifest.version = expectedVersion;
    writeJson(manifestPath, manifest);
    console.log(`updated ${rel(manifestPath)} -> ${expectedVersion}`);
  });

  console.log(`verify-version-sync: fixed (${expectedVersion})`);
};

run();
