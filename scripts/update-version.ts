import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const appFile = 'src/App.tsx';

// Get commit count
const commits = execSync('git log --oneline | wc -l').toString().trim();

// Get short hash
const hash = execSync('git rev-parse --short HEAD').toString().trim();

// New version string
const version = `v1.0.${commits}-${hash}`;

// Read App.tsx
let content = readFileSync(appFile, 'utf-8');

// Replace APP_VERSION constant
content = content.replace(
  /const APP_VERSION = 'v\d+\.\d+\.[^']+';/,
  `const APP_VERSION = '${version}';`
);

// Write back
writeFileSync(appFile, content);

console.log(`✅ Version updated: ${version}`);