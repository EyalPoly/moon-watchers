// The AI guide's JSON: what the language model fills in for each message. The model only
// describes what to do; plan.ts and scoreAdvice.ts check every value and the app acts, so a
// wrong or made-up answer can never do anything the user could not do by hand.

import { z } from 'zod'

export const MAX_INTENT_POINTS = 12
export const MAX_OPTIONS = 4
export const WEIGHT_IDS = ['L', 'C', 'DK', 'OT', 'LS', 'S', 'D'] as const
export type WeightId = (typeof WEIGHT_IDS)[number]

export const ACTIONS = ['open', 'explore', 'answer', 'ask', 'lookup', 'set_score', 'open_region'] as const

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
  /**
   * open: the user named places. explore: no place, open every catalog site.
   * answer: explain or reply. ask: a question back about missing or unclear details.
   * lookup: read reference notes first. set_score: new score weights.
   * open_region: open the Manual Selection tool. ("none" from older prompts reads as answer.)
   */
  action: z.preprocess((v) => (v === 'none' ? 'answer' : v), z.enum(ACTIONS)),
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
  /** Reference note ids to read (lookup). */
  topics: z.array(z.string().max(40)).max(6).optional(),
  /** New score weights, 0 to 1 (set_score). Missing ones keep their current value. */
  weights: z.object(Object.fromEntries(WEIGHT_IDS.map((id) => [id, optionalNumber])) as Record<WeightId, typeof optionalNumber>).optional(),
  /** A named weight preset instead of weights (set_score). */
  preset: optionalText(40),
  /** Short answers the user can pick (ask). */
  options: z.array(z.string().max(80)).max(MAX_OPTIONS).optional(),
  /** What to tell the user, in the language they wrote in. */
  reply: z.string().max(4000),
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
    action: { type: 'STRING', enum: [...ACTIONS] },
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
    topics: { type: 'ARRAY', maxItems: 6, items: { type: 'STRING' } },
    weights: {
      type: 'OBJECT',
      properties: Object.fromEntries(WEIGHT_IDS.map((id) => [id, { type: 'NUMBER' }])),
    },
    preset: { type: 'STRING' },
    options: { type: 'ARRAY', maxItems: MAX_OPTIONS, items: { type: 'STRING' } },
    reply: { type: 'STRING' },
  },
  required: ['action', 'reply'],
  propertyOrdering: ['action', 'points', 'landing', 'days', 'panel_m', 'antenna_m', 'station_id', 'name', 'topics', 'weights', 'preset', 'options', 'reply'],
} as const

export type GuideMode = 'advisor' | 'direct'

export interface GuideContext {
  sites: readonly { id: string; name: string; lat_deg: number; lon_deg: number; category?: string }[]
  stations: readonly { id: string; name: string }[]
  /** Today's date, YYYY-MM-DD, so "next March" means something. */
  today: string
  limits: { firstLanding: string; lastLanding: string; minDays: number; maxDays: number; minHeight: number; maxHeight: number }
  defaults: { landing: string; days: number; panel: number; antenna: number; station: string }
  /** The reference notes' index (id: title, about). */
  topicIndex: string
  /** What the user sees now: screen, sites with their results, score settings. */
  appState: string
  mode: GuideMode
  /** Reference notes the guide asked for, when this is the second pass. */
  reference?: { ids: string[]; text: string }
}

/** The instructions sent with every message. */
export function systemPrompt(c: GuideContext): string {
  const sites = c.sites.map((s) => `- ${s.id}: ${s.name} (${s.lat_deg}°, ${s.lon_deg}°E${s.category ? `, ${s.category}` : ''})`).join('\n')
  const stations = c.stations.map((s) => `- ${s.id}: ${s.name}`).join('\n')
  const reference = c.reference
    ? `\n\nREFERENCE NOTES you asked for (${c.reference.ids.join(', ')}). Answer from them now; do not use "lookup" again.\n${c.reference.text}`
    : ''
  return `You are the guide of Moon Watchers, a tool for planning landings near the Moon's south pole. Reply with the JSON described by the response schema, in the user's language. You never compute physics yourself: every number you mention must come from APP STATE or the reference notes.

ACTIONS
- "open": the user names one or more places. Put each in "points": a catalog site as {"site_id"}, or a typed location as {"lat_deg", "lon_deg"}.
- "explore": the user wants to look for or compare locations without naming one; the app opens every catalog site. Use it only when the user wants sites opened.
- "answer": explain something (a number, a button, a warning, a low score, how something is calculated) or reply to anything else.
- "ask": a short question back when something the user clearly cares about is missing or ambiguous (for example which site, the landing month, or their priorities). Offer up to ${MAX_OPTIONS} short "options" the user can click. Do not ask about values that have sensible defaults unless the user seems to care; say which defaults you will use instead.
- "lookup": you need reference notes to answer well (how something is calculated, what a button does, what a warning means, how to use a tool). Put up to 3 note ids in "topics" and a short "reply" such as "Checking the score notes…". The app sends the notes and asks you again.
- "set_score": the user states priorities (for example more sunlight, better communication, flat ground) or asks for different weights. Give all seven "weights" (L sunlight, C station contact, DK longest darkness, OT longest outage, LS sunlight at landing, S slope, D lunar regolith (simulated)), each 0 to 1 in steps of 0.05, or a "preset" (default, sunlight_first). In "reply", explain the trade-off in one or two sentences. Mode is ${c.mode === 'advisor' ? 'ADVISOR: the user will see your suggestion and decide whether to apply it' : 'DIRECT: the app applies your weights immediately'}.
- "open_region": the user wants to search an area or use Manual Selection. The app opens the tool and finds the best areas once the user outlines one. In "reply", explain in 2–4 short steps how to outline an area (see the region-tool note).

REFERENCE NOTES (ask for them with "lookup"):
${c.topicIndex}

CATALOG SITES (use these ids exactly; match names loosely):
${sites || '- (none loaded)'}

EARTH STATIONS (use these ids exactly):
${stations}

APP STATE (what the user sees now; letters are the site cards):
${c.appState}

RULES
- Latitude is negative in the south ("87.5 S" is -87.5). Longitude is east-positive; a west longitude is negative. Typed locations must be between 84°S and 90°S; if not, use "answer" and say so.
- "landing": UTC, YYYY-MM-DD or YYYY-MM-DDTHH:MMZ, between ${c.limits.firstLanding.slice(0, 10)} and ${c.limits.lastLanding.slice(0, 10)}. Today is ${c.today}.
- "days": ${c.limits.minDays} to ${c.limits.maxDays}. A month is 30 days, a week 7 days, a lunar day 29.53 days.
- "panel_m", "antenna_m": ${c.limits.minHeight} to ${c.limits.maxHeight} m.
- Leave out fields the user did not mention; the app uses its defaults (landing ${c.defaults.landing.slice(0, 10)}, ${c.defaults.days} days, panel ${c.defaults.panel} m, antenna ${c.defaults.antenna} m, station ${c.defaults.station}).
- When explaining a score, use the site's factors (points lost), deciding factor, chip reasons and warnings from APP STATE. Name the biggest losses first, then suggest concrete changes the app supports (another date, +29.5 d, taller panel or antenna, another station, a nearby site with Manual Selection, or weights matching their priorities).
- The score is illustrative (the physics team's example weights); the lunar regolith (dust) index is simulated. Say so when it matters.
- Keep "reply" short and plain: a few sentences or a short list. No markdown tables.${reference}`
}
