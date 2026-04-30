# LLM proxy (Cloudflare Worker)

Sit di antara Hermes container dan LLM provider. Tugasnya:

1. Verify customer JWT (sub = customer_id)
2. Check credit balance di Supabase
3. Forward call ke provider (Zhipu / DeepSeek / Anthropic)
4. Calculate cost berdasarkan token usage
5. Debit credits dari balance pelanggan
6. Log usage

Pakai Cloudflare Worker karena gratis (100k req/hari free tier) + edge low-latency.

## Setup

```bash
npm install
npx wrangler login

# Set secrets
npx wrangler secret put PROXY_JWT_SECRET
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ZHIPU_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY
# (optional) npx wrangler secret put ANTHROPIC_API_KEY

# Test locally
npm run dev

# Deploy
npm run deploy
```

## Endpoints

### `POST /chat/completions`

OpenAI-compatible. Hermes container call ini, bukan provider langsung.

Header: `Authorization: Bearer <customer-jwt>`

Body: standard OpenAI chat completions.

Routing rules:

| Model di body | Provider |
|---------------|----------|
| `glm-*` (default `glm-4-flash`) | Zhipu |
| `deepseek-*` | DeepSeek |
| `claude-*` | Anthropic (kalau credits cukup, premium tier) |

### `GET /balance`

Cek credit balance (pelanggan bisa lihat di dashboard).

## Credit math

```
cost_usd = (input_tokens × input_rate + output_tokens × output_rate) / 1M
```

Rates (per 1M tokens, USD):

| Provider | Model | Input | Output |
|----------|-------|-------|--------|
| Zhipu | glm-4-flash | 0.00 | 0.00 (free tier) |
| Zhipu | glm-4.5 | 0.60 | 2.20 |
| DeepSeek | deepseek-chat | 0.27 | 1.10 |
| Anthropic | claude-haiku-4-5 | 0.25 | 1.25 |
| Anthropic | claude-sonnet-4-6 | 3.00 | 15.00 |

Simpan rates sebagai const di `src/pricing.ts`. Update kapan saja, deploy ulang.
