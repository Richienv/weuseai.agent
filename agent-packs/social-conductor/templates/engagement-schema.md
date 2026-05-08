# Engagement Log Schema

> SQLite schema untuk `engagement-log-tracker`. Persisted di `/var/lib/weuseai/customer-grown/engagement-log.sqlite`.

---

## Table: `engagement_entries`

```sql
CREATE TABLE engagement_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  platform TEXT NOT NULL,            -- tiktok | reels | x | linkedin | instagram | threads | facebook | email | dm
  type TEXT NOT NULL,                -- comment | dm | mention | reply | review
  source_handle TEXT,                -- @username or email
  source_followers INTEGER,          -- optional, for priority weighting
  content TEXT NOT NULL,             -- raw text customer pasted
  context_url TEXT,                  -- optional link to original post
  priority TEXT DEFAULT 'normal',    -- high | normal | low
  status TEXT DEFAULT 'pending',     -- pending | replied | escalated | skipped | archived
  draft_reply TEXT,
  draft_voice_fit TEXT,              -- high | medium | low
  replied_at DATETIME,
  reply_text_actual TEXT,            -- what customer actually sent (for voice drift tracking)
  escalation_reason TEXT,
  logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_engagement_status ON engagement_entries (customer_id, status);
CREATE INDEX idx_engagement_priority ON engagement_entries (customer_id, priority, status);
CREATE INDEX idx_engagement_logged ON engagement_entries (customer_id, logged_at DESC);
```

---

## Priority classification rules

Auto-assign on log-new:

### High
- Contains complaint signal ("ngga work", "kecewa", "refund", "tolong help")
- Sensitive question (financial, medical, legal)
- Customer business inquiry ("price?", "how to order", "kapan available")
- Source handle has >100 followers (probably influencer / press)
- Mention from journalist / brand account

### Normal (default)
- Standard appreciation ("makasih", "good post")
- Casual question
- Peer interaction
- Generic engagement

### Low
- Emoji-only response
- Generic spam-like ("nice post" with no context, repeat handles)
- Duplicate of recent entry

---

## Status state machine

```
pending → replied → archived
        ↘ escalated → archived (after customer handled)
        ↘ skipped → archived
```

- `pending`: logged, awaiting customer action
- `replied`: customer sent reply, captured `reply_text_actual`
- `escalated`: customer flagged for personal handling (Social Conductor doesn't draft, just tracks)
- `skipped`: customer explicitly chose not to reply (e.g., low priority spam)
- `archived`: closed entry, indexed for analytics

---

## Common queries

### Pending high priority, age-sorted
```sql
SELECT * FROM engagement_entries
WHERE customer_id = ?
  AND status = 'pending'
  AND priority = 'high'
ORDER BY logged_at ASC;
```

### Daily digest (last 24h pending)
```sql
SELECT priority, COUNT(*) as count
FROM engagement_entries
WHERE customer_id = ?
  AND status = 'pending'
  AND logged_at >= datetime('now', '-1 day')
GROUP BY priority;
```

### Weekly engagement volume
```sql
SELECT date(logged_at) as day, type, COUNT(*) as count
FROM engagement_entries
WHERE customer_id = ?
  AND logged_at >= date('now', '-7 days')
GROUP BY day, type
ORDER BY day DESC;
```

### Voice drift signal — actual reply text vs draft
```sql
SELECT * FROM engagement_entries
WHERE customer_id = ?
  AND replied_at IS NOT NULL
  AND draft_reply IS NOT NULL
  AND reply_text_actual IS NOT NULL
ORDER BY replied_at DESC
LIMIT 30;
```
(feeds voice-consistency-checker weekly-drift-check)

---

## Privacy notes

- All engagement content is customer-input only (manual paste from their own platforms)
- No platform API scraping — schema designed for manual logging workflow
- `source_handle` stored as-is from customer input; not validated against platforms
- Retention: archived entries kept 12 months for analytics, then purged (configurable)
