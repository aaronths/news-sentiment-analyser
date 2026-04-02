const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// 1. Build the main API (Bundled into one file)
esbuild.build({
  entryPoints: ['src/main.ts'], 
  bundle: true,                 
  minify: true,                 
  platform: 'node',             
  target: 'node20',             
  outfile: 'dist/index.js',     
  external: ['@aws-sdk/*'], 
}).catch(() => process.exit(1));

// 2. Find all test files
const testsDir = path.join(__dirname, 'src', 'tests');
if (fs.existsSync(testsDir)) {
  const testFiles = fs.readdirSync(testsDir)
    .filter(file => file.endsWith('.test.ts'))
    .map(file => path.join('src/tests', file));

  // 3. Build the tests (Unbundled, placed in dist/tests)
  if (testFiles.length > 0) {
    esbuild.build({
      entryPoints: testFiles,
      bundle: false,     // Do NOT bundle tests together
      platform: 'node',
      target: 'node20',
      outdir: 'dist/tests', 
    }).catch(() => process.exit(1));
  }
}