import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const appFile = 'src/App.tsx';

const commits = execSync('git log --oneline | wc -l').toString().trim();
const version = `v1.0.${commits}`;

let content = readFileSync(appFile, 'utf-8');
content = content.replace(
  /const APP_VERSION = 'v\d+\.\d+(-[a-f0-9]+)?';/,
  `const APP_VERSION = '${version}';`
);

writeFileSync(appFile, content);
console.log(`✅ Version: ${version}`);