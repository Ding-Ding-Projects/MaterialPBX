FROM node:22.14.0-bookworm-slim AS builder
WORKDIR /src/packages/protocol
COPY packages/protocol/package*.json ./
RUN npm ci --ignore-scripts --install-links
COPY packages/protocol/tsconfig.json ./
COPY packages/protocol/src ./src
RUN npm run build

WORKDIR /src/services/control-plane
COPY services/control-plane/package*.json ./
RUN npm ci --ignore-scripts --install-links
COPY services/control-plane/tsconfig.json ./
COPY services/control-plane/scripts ./scripts
COPY services/control-plane/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.14.0-bookworm-slim
WORKDIR /opt/materialpbx
COPY --from=builder /src/services/control-plane/dist ./dist
COPY --from=builder /src/services/control-plane/node_modules ./node_modules
COPY --from=builder /src/services/control-plane/package.json ./package.json
RUN groupadd --system --gid 991 materialpbx \
 && useradd --system --uid 991 --gid materialpbx --home-dir /var/lib/materialpbx --shell /usr/sbin/nologin materialpbx
USER materialpbx
ENTRYPOINT ["node", "dist/server.js"]
