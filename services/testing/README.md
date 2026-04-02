## To deploy

1. Run `npm run build:lambda`
2. Delete `testing-service.zip` from dist folder if exists
3. Run `zip -r dist/testing-service.zip dist/ tests/ node_modules/ package.json`