#!/usr/bin/env node
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../public/static/style.css');
const destDir = join(__dirname, '../../api/public/static');
const dest = join(destDir, 'style.css');

if (!existsSync(src)) {
  console.warn('copy-static-assets: source style.css not found, skipping');
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('Copied style.css to api/public/static/');
