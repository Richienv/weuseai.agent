# Content Calendar Schema

> SQLite (or JSON fallback) schema untuk `content-calendar-builder`. Persisted di `/var/lib/weuseai/customer-grown/content-calendar.sqlite`.

---

## Tables

### `calendar_entries`

```sql
CREATE TABLE calendar_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  platform TEXT NOT NULL,            -- tiktok | reels | x | linkedin | blog | threads | facebook
  slot_date DATE NOT NULL,           -- YYYY-MM-DD
  slot_time TEXT,                    -- HH:MM optional, target post time
  theme TEXT,                        -- weekly theme (e.g. "tips budgeting basics")
  content_type TEXT,                 -- hook-video | long-form | listicle | demo | story | thread | etc.
  status TEXT DEFAULT 'planned',     -- planned | drafting | draft-ready | scheduled | posted | skipped
  draft_id INTEGER,                  -- FK to drafts table
  posted_at DATETIME,                -- ISO timestamp when customer marked posted
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (draft_id) REFERENCES drafts(id)
);
CREATE INDEX idx_calendar_customer_date ON calendar_entries (customer_id, slot_date);
CREATE INDEX idx_calendar_status ON calendar_entries (customer_id, status);
```

### `drafts`

```sql
CREATE TABLE drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  topic TEXT,
  content_text TEXT NOT NULL,
  voice_fit_score TEXT,              -- high | medium | low
  voice_fit_dimensions TEXT,         -- JSON breakdown per dimension
  iteration_count INTEGER DEFAULT 1,
  parent_draft_id INTEGER,           -- if iterated from prior
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_draft_id) REFERENCES drafts(id)
);
```

### `themes`

```sql
CREATE TABLE themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  theme TEXT NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Status state machine

```
planned → drafting → draft-ready → scheduled → posted
                              ↘ skipped
```

- `planned`: slot defined, no draft yet
- `drafting`: post-drafter generating
- `draft-ready`: draft exists, fit-checked, awaiting customer post
- `scheduled`: customer scheduled di platform native scheduler (manual)
- `posted`: customer confirmed posted
- `skipped`: customer skipped slot intentionally (logged for cadence analysis)

---

## Common queries

### This week's calendar
```sql
SELECT * FROM calendar_entries
WHERE customer_id = ?
  AND slot_date BETWEEN date('now', 'weekday 1', '-7 days') AND date('now', 'weekday 1', '-1 day')
ORDER BY slot_date, slot_time;
```

### Pending drafts (>2 days from slot)
```sql
SELECT * FROM calendar_entries
WHERE customer_id = ?
  AND status IN ('planned', 'drafting')
  AND slot_date <= date('now', '+2 days')
ORDER BY slot_date;
```

### Cadence analysis (last 30 days)
```sql
SELECT platform, status, COUNT(*) as count
FROM calendar_entries
WHERE customer_id = ?
  AND slot_date >= date('now', '-30 days')
GROUP BY platform, status;
```

---

## Export formats

### `.ics` (iCalendar)
Each `calendar_entry` exports as `VEVENT`:
```
BEGIN:VEVENT
UID:{customer_id}-{entry_id}@weuseai.agent
DTSTART;TZID=Asia/Jakarta:{slot_date}T{slot_time}00
SUMMARY:[{platform}] {theme}
DESCRIPTION:Content type: {content_type}\nStatus: {status}
END:VEVENT
```

### CSV
Columns: `date, time, platform, theme, content_type, status, draft_preview`.

---

## DB lifecycle

- Created on first `content-calendar-builder` invocation
- Backed up weekly to `/var/lib/weuseai/customer-grown/backups/calendar-YYYY-WW.sqlite`
- Migrations versioned in `/var/lib/weuseai/customer-grown/db-migrations/`
