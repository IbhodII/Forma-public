#!/usr/bin/env node
/**
 * Fail if mobile/src or frontend/src import the other platform or forbidden packages.
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

const SCAN = [
  {
    root: join(repoRoot, 'mobile', 'src'),
    forbidden: [
      /\bfrom\s+['"][^'"]*frontend\//,
      /\brequire\s*\(\s*['"][^'"]*frontend\//,
      /\bfrom\s+['"]react-dom\b/,
      /\bfrom\s+['"]plotly/,
      /\bfrom\s+['"]electron\b/,
    ],
    label: 'mobile',
  },
  {
    root: join(repoRoot, 'frontend', 'src'),
    forbidden: [
      /\bfrom\s+['"][^'"]*mobile\//,
      /\brequire\s*\(\s*['"][^'"]*mobile\//,
      /\bfrom\s+['"]react-native\b/,
    ],
    label: 'frontend',
  },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

let failed = false;
for (const {root, forbidden, label} of SCAN) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(repoRoot, file);
    for (const re of forbidden) {
      if (re.test(text)) {
        console.error(`[${label}] ${rel}: forbidden import pattern ${re}`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log('check-platform-imports: OK');
