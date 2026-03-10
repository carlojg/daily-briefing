-- Einmal in Supabase SQL Editor ausführen
-- Supabase → SQL Editor → New Query → alles einfügen → Run

CREATE TABLE IF NOT EXISTS daily_entries (
  date        TEXT PRIMARY KEY,           -- Format: YYYY-MM-DD
  payload     JSONB NOT NULL DEFAULT '{}',-- alle Tagesdaten als JSON
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Index für schnelles Laden nach Datum
CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(date DESC);

-- Row Level Security: nur angemeldete User (oder public für single-user app)
ALTER TABLE daily_entries ENABLE ROW LEVEL SECURITY;

-- Policy: alle Zugriffe erlaubt (single-user App, kein Login nötig)
CREATE POLICY "allow_all" ON daily_entries
  FOR ALL USING (true) WITH CHECK (true);
