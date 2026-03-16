const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/main.ts'], 
  bundle: true,                 
  minify: true,                 
  platform: 'node',             
  target: 'node20',             
  outfile: 'dist/index.js',     
  external: ['@aws-sdk/*'], // Exclude AWS SDK since Lambda already has it
}).catch(() => process.exit(1));