# syntax=docker/dockerfile:1
# Image de l'application (sortie « standalone » de Next.js). Utilisée par le serveur de test
# sur VPS (ADR 0016) ; neutre vis-à-vis de l'hébergeur. Aucun secret n'est copié dans l'image :
# les variables serveur sont fournies à l'exécution.

FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts : aucun script d'installation (dont le binaire Supabase CLI) n'est nécessaire au build.
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
# Les variables NEXT_PUBLIC_* sont intégrées au build (y compris dans proxy.ts) : jamais de secret ici.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STAFF_SSO_ENABLED=false
ARG NEXT_PUBLIC_CLIO_BOOKING_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-alpine AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
