// The AI guide's JSON: what the language model fills in from the user's text. The model
// only describes the request; plan.ts checks every value and builds the sites itself, so
// a wrong or made-up answer can never open a site the app could not open by hand.

import { z } from 'zod'

export const MAX_INTENT_POINTS = 12

const optionalNumber = z.number().finite().optional()
const optionalText = (max: number) => z.string().max(max).optional()

export const intentPoint = z.object({
  /** A catalog site id from the list the model was given. */
  site_id: optionalText(64),
  /** Selenographic latitude, negative south. */
  lat_deg: optionalNumber,
  /** Longitude, east-positive (a west value is negative). */
  lon_deg: optionalNumber,
})

export const intentSchema = z.object({
  /** open: the user named places. explore: no place, open every catalog site. none: nothing to open. */
  action: z.enum(['open', 'explore', 'none']),
  points: z.array(intentPoint).max(MAX_INTENT_POINTS).optional(),
  /** Landing date or time: YYYY-MM-DD or YYYY-MM-DDTHH:MMZ, UTC. */
  landing: optionalText(32),
  /** Time on the Moon in days. */
  days: optionalNumber,
  panel_m: optionalNumber,
  antenna_m: optionalNumber,
  /** An Earth station id from the list the model was given. */
  station_id: optionalText(64),
  /** A short name for the site card, when the user gave or implied one. */
  name: optionalText(80),
  /** One or two sentences for the user, in the language they wrote in. */
  reply: z.string().max(1000),
})

export type Intent = z.infer<typeof intentSchema>
export type IntentPoint = z.infer<typeof intentPoint>

/**
 * The same shape for Gemini's JSON mode (OpenAPI subset). Optional fields are simply left
 * out of `required`; intent.test.ts checks the two shapes list the same fields.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    action: { type: 'STRING', enum: ['open', 'explore', 'none'] },
    points: {
      type: 'ARRAY',
      maxItems: MAX_INTENT_POINTS,
      items: {
        type: 'OBJECT',
        properties: {
          site_id: { type: 'STRING' },
          lat_deg: { type: 'NUMBER' },
          lon_deg: { type: 'NUMBER' },
        },
      },
    },
    landing: { type: 'STRING' },
    days: { type: 'NUMBER' },
    panel_m: { type: 'NUMBER' },
    antenna_m: { type: 'NUMBER' },
    station_id: { type: 'STRING' },
    name: { type: 'STRING' },
    reply: { type: 'STRING' },
  },
  required: ['action', 'reply'],
  propertyOrdering: ['action', 'points', 'landing', 'days', 'panel_m', 'antenna_m', 'station_id', 'name', 'reply'],
} as const

export interface GuideContext {
  sites: readonly { id: string; name: string; lat_deg: number; lon_deg: number; category?: string }[]
  stations: readonly { id: string; name: string }[]
  /** Today's date, YYYY-MM-DD, so "next March" means something. */
  today: string
  limits: { firstLanding: string; lastLanding: string; minDays: number; maxDays: number; minHeight: number; maxHeight: number }
  defaults: { landing: string; days: number; panel: number; antenna: number; station: string }
}

/** The instructions sent with every message. */
export function systemPrompt(c: GuideContext): string {
  const sites = c.sites.map((s) => `- ${s.id}: ${s.name} (${s.lat_deg}°, ${s.lon_deg}°E${s.category ? `, ${s.category}` : ''})`).join('\n')
  const stations = c.stations.map((s) => `- ${s.id}: ${s.name}`).join('\n')
  return `You are the planning guide of Moon Watchers, a tool for choosing landing sites near the Moon's south pole.
Turn the user's message into the JSON described by the response schema. You never compute results yourself; the app does.

Actions:
- "open": the user names one or more places. Put each in "points": a catalog site as {"site_id"}, or a typed location as {"lat_deg", "lon_deg"}.
- "explore": the user wants to look for or compare locations without naming one. Leave "points" empty; the app opens every catalog site.
- "none": anything else (a question, a greeting, or a place you cannot place). Explain briefly in "reply".

Catalog sites (use these ids exactly; match names loosely, e.g. "sample A" is sample_a):
${sites || '- (none loaded)'}

Earth stations for direct contact (use these ids exactly):
${stations}

Rules:
- Latitude is negative in the south ("87.5 S" is -87.5). Longitude is east-positive; a west longitude is negative. Typed locations must be between 84°S and 90°S; if not, use "none" and say so.
- "landing": UTC, as YYYY-MM-DD or YYYY-MM-DDTHH:MMZ, between ${c.limits.firstLanding.slice(0, 10)} and ${c.limits.lastLanding.slice(0, 10)}. Today is ${c.today}.
- "days": time on the Moon, ${c.limits.minDays} to ${c.limits.maxDays}. A month is 30 days, a week 7 days, a lunar day 29.53 days.
- "panel_m" and "antenna_m": solar panel and antenna heights above the ground in meters, ${c.limits.minHeight} to ${c.limits.maxHeight}.
- Leave out every field the user did not mention; the app uses its defaults (landing ${c.defaults.landing.slice(0, 10)}, ${c.defaults.days} days, panel ${c.defaults.panel} m, antenna ${c.defaults.antenna} m, station ${c.defaults.station}).
- "name": only when the user gives the mission or site a name; at most 40 characters.
- "reply": one or two short sentences in the user's language saying what will open. Do not invent numbers about sunlight, contact or scores.`
}
