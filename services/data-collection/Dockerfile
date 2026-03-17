# Use a Node image
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the code and compile TypeScript to JavaScript
COPY . .
RUN npm run build

# Use a clean image for running to keep it small
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
RUN npm install --only=production

# Expose the port the service will run on
EXPOSE 8000

# Run the ingestion script when the container starts
CMD ["node", "dist/src/scripts/run-ingestion.js"]