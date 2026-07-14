# Provisioning service — Node 20 alpine, runs TS source directly via tsx.
#
# Why tsx (not pre-compiled JS): the service imports from sibling workspace
# packages (../../hermes/src/adapters) via relative paths. Pre-compiling
# would require coordinating tsc rootDir + outDir across all referenced
# workspaces and hand-mapping the output paths. tsx resolves at runtime,
# zero glue. Image bloat from including tsx is ~30MB — acceptable trade.
#
# Build context: monorepo root. Run from there:
#   fly deploy --config services/provisioning/fly.toml \
#              --dockerfile services/provisioning/Dockerfile \
#              --remote-only

FROM node:20-alpine

# System deps required by ExecSshProvisioner.runSetup():
#   openssh-client  → `ssh` binary
#   sshpass         → password-based auth used for IDCloudHost VMs
#                     (their default flow is root + password; SSH-key
#                     bootstrap is Phase 3 work)
# Without these the provisioning service spawns sshpass and gets ENOENT,
# fails the SSH step, and the customer's VM is created but never set up.
RUN apk add --no-cache openssh-client sshpass

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8081

# Workspace manifests first for cached layer.
COPY package.json package-lock.json ./
COPY services/provisioning/package.json ./services/provisioning/
COPY services/hermes/package.json ./services/hermes/
COPY services/proxy/package.json ./services/proxy/
COPY services/payment/package.json ./services/payment/
# services/test-idcloudhost/ workspace removed 2026-05-13 alongside the
# IDCloudHost adapter retirement (PR #90).
# packages/shared/ is a placeholder (.gitkeep only) — no package.json yet,
# add a COPY line here once it's populated.

# Full install (tsx is in devDeps and we run TS source directly in prod).
RUN npm ci --include=dev && npm cache clean --force

# Source.
COPY services/ ./services/
COPY packages/ ./packages/
# customer-flow.ts imports signCustomerToken from supabase/functions/_shared/
# hermes-instance-auth (Phase 5-3.c HMAC token rollout). Production hotfix
# 2026-05-10: image was missing supabase/, causing crashloop on first
# /spin-up call (hidden because auto_stop_machines kept the broken image
# dormant — surfaced when Track 3a deploy woke the machine).
COPY supabase/ ./supabase/
# HF-2c (2026-05-13): customer-flow.ts reads agent-packs/_bootstrap-bundle.tar.gz
# at module load. Pre-HF-2c the image did NOT copy agent-packs/, so the
# read failed with ENOENT, BOOTSTRAP_BUNDLE_BASE64 was empty, and every
# customer's setup-script ran without bundleTarBase64 → no
# WEUSEAI_AGENT_SLUG env, no bundle-pull script install, no persona
# bundles ever installed. The first sign was the recurring Fly log line
# "[customer-flow] Bootstrap bundle missing or unreadable: ENOENT" — but
# the install-if-missing self-heal in refresh-env masked the bigger
# problem until the multi-persona MVP + race-condition surfaced both
# together 2026-05-13.
COPY agent-packs/ ./agent-packs/
COPY tsconfig.json ./

EXPOSE 8081

CMD ["node_modules/.bin/tsx", "services/provisioning/src/index.ts"]
