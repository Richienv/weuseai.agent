# Customer email templates

Bahasa Indonesia lifecycle emails sent from the platform (brand → customer)
for non-product moments. These are NOT persona-output emails — those live
under `agent-packs/`.

## Voice rules

These templates follow `CLAUDE.md` brand voice:

- **Bahasa Indonesia** primary; English for technical terms (Telegram, bot,
  OpenRouter, API, VPS).
- **`kamu`** form, never `Anda` or `lo/gue`.
- **One idea per sentence**, two-sentence paragraphs preferred.
- **Zero exclamation marks** in body copy.
- **Banned words** (never use): `basically`, `just`, `literally`, `honestly`,
  `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`,
  `next-level`.
- Calm-premium register. Not Duolingo, not founder-bro.

## Variable convention

Variables use Handlebars-style `{{variable_name}}` substitution. Each file
begins with a `<!-- Variables -->` block listing every variable with its
type and a short description. Match this convention when the sender code
fills them in (`services/` / `supabase/functions/_shared/email-delivery.ts`).

## Sender + footer

Default sender: `noreply@weuseai.agent` (per `email-delivery.ts`).
Reply-to / support: `support@weuseai.agent`.
WhatsApp support: `+62 821-5490-2561` (Sen-Sab, 09.00-21.00 WIB).

Every template signs off:

```
— weuseai.agent
Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.
```

## Templates

| File | Trigger |
|------|---------|
| `welcome.md` | Customer paid + completed onboarding form, agent activated |
| `setup-help.md` | Customer stuck on onboarding (bot token, VPS boot, etc.) |
| `flow-paused.md` | `customer_flow_state` row at `awaiting_customer`/`escalated` for 7 days |
| `flow-expired.md` | Parked playbook run hit 14-day TTL and auto-aborted |
| `refund.md` | Refund has been initiated |
| `support-handoff.md` | Admin manually handled a ticket and hands back to customer |
