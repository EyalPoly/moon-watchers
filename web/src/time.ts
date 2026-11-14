// Times in the app are ISO 8601 UTC on the engine's 10-minute grid: YYYY-MM-DDTHH:MMZ.

export const STEP_MIN = 10
export const STEP_MS = STEP_MIN * 60_000
export const DAY_MS = 86_400_000
/** 29.53 days rounded to the 10-minute grid: 29 d 12 h 40 min (spec §9.2). */
export const LUNAR_DAY_MS = (29 * 24 * 60 + 12 * 60 + 40) * 60_000

const ISO_MINUTE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})Z$/

export function parseIsoMinute(text: string): number | null {
  const m = ISO_MINUTE.exec(text)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const ms = Date.UTC(y, mo - 1, d, h, mi)
  const back = new Date(ms)
  // Rejects 2027-02-30 and similar, which Date.UTC would silently roll over.
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) return null
  return ms
}

export function formatIsoMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16) + 'Z'
}

export function snapToStep(ms: number): number {
  return Math.round(ms / STEP_MS) * STEP_MS
}

export function monthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7)
}

/** Month keys (YYYY-MM) covering [startMs, endMs]. */
export function monthsBetween(startMs: number, endMs: number): string[] {
  const out: string[] = []
  const d = new Date(startMs)
  let y = d.getUTCFullYear()
  let m = d.getUTCMonth()
  const end = monthKey(endMs)
  for (;;) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    out.push(key)
    if (key >= end) return out
    m += 1
    if (m === 12) {
      m = 0
      y += 1
    }
  }
}

export function monthStartMs(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, 1)
}

export function monthEndMs(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return Date.UTC(y, m, 1)
}

/** "2 d 4 h", "3 h 20 min", "40 min". Never seconds (spec §7.3: no false precision). */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const min = totalMin % 60
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`
  if (h > 0) return min > 0 ? `${h} h ${min} min` : `${h} h`
  return `${min} min`
}

/** "1 Mar 2027, 14:20 UTC" */
export function formatUtc(ms: number): string {
  const d = new Date(ms)
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`
}

/** Mission elapsed time in minutes as "Day 3, 04:20". */
export function missionClock(tauMin: number): string {
  const day = Math.floor(tauMin / 1440)
  const hh = String(Math.floor((tauMin % 1440) / 60)).padStart(2, '0')
  const mm = String(tauMin % 60).padStart(2, '0')
  return `Day ${day}, ${hh}:${mm}`
}
