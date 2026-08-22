FROM node:22.14.0-bookworm-slim AS builder
WORKDIR /src/packages/protocol
COPY packages/protocol/package*.json ./
RUN npm ci --ignore-scripts --install-links
COPY packages/protocol/tsconfig.json ./
COPY packages/protocol/src ./src
RUN npm run build

WORKDIR /src/services/privileged-helper
COPY services/privileged-helper/package*.json ./
RUN npm ci --ignore-scripts --install-links
COPY services/privileged-helper/tsconfig.json ./
COPY services/privileged-helper/scripts ./scripts
COPY services/privileged-helper/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.14.0-bookworm-slim
WORKDIR /opt/materialpbx-helper
COPY --from=builder /src/services/privileged-helper/dist ./dist
COPY --from=builder /src/services/privileged-helper/node_modules ./node_modules
COPY services/privileged-helper/package.json ./package.json
ENTRYPOINT ["node", "dist/server.js"]
