# ─── 1. deps: install dependencies only (cached separately from source changes) ───
FROM node:20-alpine AS deps
WORKDIR /app
# .npmrc sets legacy-peer-deps=true (needed for the next-auth/nodemailer peer conflict) —
# must be copied in before npm ci, otherwise it silently runs without that setting.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ─── 2. builder: build the Next.js app ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env vars that must be baked into the client bundle (NEXT_PUBLIC_*) —
# pass them with --build-arg when building the image.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build

# ─── 3. runner: minimal production image ──────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone output already contains a pruned node_modules + server.js
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Local-disk upload fallback (used when BLOB_READ_WRITE_TOKEN is not set) writes here —
# mount a persistent volume at this path so uploaded files survive container restarts.
RUN mkdir -p ./public/uploads && chown nextjs:nodejs ./public/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
