ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost/build npx prisma generate && npm run build

FROM build AS migrate
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM build AS production-deps
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/openapi.yaml ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
