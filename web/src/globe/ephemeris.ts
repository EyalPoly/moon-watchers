import type { Directions, Vec3 } from '../../public/orbit/moon-orbit/moon-orbit'
import { DAY_MS } from '../time'

const HOUR = DAY_MS / 24
const FIELDS = 10

/** Interpolate the two MOON_ME unit vectors and a column-major Earth rotation. */
export function directionsAt(table: Int16Array, year: number, utc: number): Directions {
  const start = Date.UTC(year, 0, 1)
  const hours = (Date.UTC(year + 1, 0, 1) - start) / HOUR
  const index = (utc - start) / HOUR
  if (table.length !== (hours + 1) * FIELDS || !Number.isFinite(index) || index < 0 || index > hours) {
    throw new RangeError('The selected UTC is outside the orbit table')
  }
  const hour = Math.min(Math.floor(index), hours - 1)
  const f = index - hour
  const a = table.subarray(hour * FIELDS, (hour + 1) * FIELDS)
  const b = table.subarray((hour + 1) * FIELDS, (hour + 2) * FIELDS)
  function direction(offset: number): Vec3 {
    const lerp = (i: number) => a[i] + (b[i] - a[i]) * f
    const x = lerp(offset), y = lerp(offset + 1), z = lerp(offset + 2)
    const norm = Math.hypot(x, y, z)
    return [x / norm, y / norm, z / norm]
  }

  // q and -q describe the same orientation. Follow the short arc across each hour.
  const qa = Array.from(a.subarray(6))
  const qb = Array.from(b.subarray(6))
  const la = Math.hypot(...qa), lb = Math.hypot(...qb)
  const dot = qa.reduce((sum, n, i) => sum + n * qb[i], 0) / (la * lb)
  const angle = Math.acos(Math.min(1, Math.abs(dot)))
  const weight = (t: number) => angle < 0.0001 ? t : Math.sin(t * angle) / Math.sin(angle)
  const wa = weight(1 - f) / la, wb = weight(f) / lb * (dot < 0 ? -1 : 1)
  const q = qa.map((v, i) => wa * v + wb * qb[i])
  const length = Math.hypot(...q)
  const [w, x, y, z] = q.map(v => v / length)
  return {
    sun: direction(0),
    earth: direction(3),
    earthFixedToMoon: [
      1 - 2 * (y*y + z*z), 2 * (x*y + w*z), 2 * (x*z - w*y),
      2 * (x*y - w*z), 1 - 2 * (x*x + z*z), 2 * (y*z + w*x),
      2 * (x*z + w*y), 2 * (y*z - w*x), 1 - 2 * (x*x + y*y),
    ],
  }
}

export async function loadOrbitYear(year: number, signal: AbortSignal): Promise<Int16Array> {
  const response = await fetch(`${import.meta.env.BASE_URL}orbit/ephemeris/${year}.bin`, { signal })
  if (!response.ok) throw new Error('Orbit time data is unavailable')
  const bytes = await response.arrayBuffer()
  const hours = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / HOUR
  if (bytes.byteLength !== (hours + 1) * FIELDS * 2) throw new Error('Incomplete orbit time data')
  return new Int16Array(bytes)
}
