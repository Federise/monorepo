# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./

# Copy packages
COPY packages/gateway-core ./packages/gateway-core

# Copy app
COPY apps/self ./apps/self

# Install dependencies and build native modules
RUN pnpm install --frozen-lockfile
RUN pnpm rebuild better-sqlite3

# Build packages
RUN pnpm --filter @federise/gateway-core build
RUN pnpm --filter federise-self build

# Deploy federise-self to a standalone directory
RUN pnpm --filter federise-self deploy --prod --legacy /deploy

# Copy dist folder (pnpm deploy doesn't include build artifacts)
RUN cp -r /app/apps/self/dist /deploy/dist

# Rebuild better-sqlite3 in deploy directory using npm (bypasses pnpm script restrictions)
WORKDIR /deploy
RUN npm rebuild better-sqlite3

# Production stage
FROM node:22-slim

WORKDIR /app

# Copy the deployed standalone app
COPY --from=builder /deploy ./

# Create data directory
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "dist/index.js"]
