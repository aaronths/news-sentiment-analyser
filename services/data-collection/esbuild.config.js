const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/main.ts'], // Point this to your main Express file
  bundle: true,                 // Bundle all dependencies into one file
  minify: true,                 // Shrink the file size
  platform: 'node',             // Target Node.js environment
  target: 'node20',             // AWS Lambda supports Node.js 20
  outfile: 'dist/index.js',     // The single output file
  external: ['@aws-sdk/*'], 
}).catch(() => process.exit(1));