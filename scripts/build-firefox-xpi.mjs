import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist-firefox');
const manifestPath = path.join(distDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('dist-firefox/manifest.json not found. Run npm run build:firefox first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const rawName = String(manifest.name || 'extension')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '-');
const version = String(manifest.version || '0.0.0').trim();
const filename = `${rawName}-${version}.xpi`;

execSync(
  `npx web-ext build --source-dir "${distDir}" --artifacts-dir "${distDir}" --filename "${filename}" --overwrite-dest`,
  {
    stdio: 'inherit',
  },
);
