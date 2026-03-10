import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kupxnbcjwegghganvfjd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1cHhuYmNqd2VnZ2hnYW52ZmpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDM3MTgsImV4cCI6MjA4ODcxOTcxOH0.jZw-Mecn1n9BvX7Ou8xmSJx1u_Dew1OgrFSgG_4K4bo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Tagesschlüssel ─────────────────────────────────────────────────────────
export const todayKey = () => new Date().toISOString().slice(0, 10)

// ── Einen Tag laden ────────────────────────────────────────────────────────
export async function loadDay(date) {
  const { data, error } = await supabase
    .from('daily_entries')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  if (error) console.error('loadDay error:', error)
  return data?.payload || null
}

// ── Einen Tag speichern ────────────────────────────────────────────────────
export async function saveDay(date, payload) {
  const { error } = await supabase
    .from('daily_entries')
    .upsert({ date, payload, updated_at: new Date().toISOString() }, { onConflict: 'date' })
  if (error) console.error('saveDay error:', error)
}

// ── Letzte N Tage laden (für Review) ──────────────────────────────────────
export async function loadLastDays(n = 30) {
  const { data, error } = await supabase
    .from('daily_entries')
    .select('date, payload')
    .order('date', { ascending: false })
    .limit(n)
  if (error) console.error('loadLastDays error:', error)
  return data || []
}
