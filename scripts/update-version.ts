import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const appFile = 'src/App.tsx';

const commits = execSync('git log --oneline | wc -l').toString().trim();
const shortHash = execSync('git rev-parse --short HEAD').toString().trim();
const buildDate = new Date().toISOString().replace('T', ' ').slice(0, 16); // YYYY-MM-DD HH:MM

// v1.0.NN  ·  hash  ·  fecha → espacios alrededor para legibilidad
const version = `v1.0.${commits}  ·  ${shortHash}  ·  ${buildDate} UTC`;

let content = readFileSync(appFile, 'utf-8');
content = content.replace(
  /const APP_VERSION = '[^']+';/,
  `const APP_VERSION = '${version}';`
);

writeFileSync(appFile, content);
console.log(`✅ Version: ${version}`);
