// The AI guide talks to Google Gemini straight from the browser with the user's own key.
// The key goes only to Google, in a header (never in a URL); our server never sees it.

import { GEMINI_RESPONSE_SCHEMA, intentSchema, type Intent } from './intent'

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
/** Google's stable low-cost model for new projects (Nov 2026); the user can pick another. */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const MODEL = /^[a-z0-9][a-z0-9.-]{1,62}$/

export type GeminiErrorKind = 'key' | 'model' | 'quota' | 'network' | 'answer' | 'blocked'

export class GeminiError extends Error {
  readonly kind: GeminiErrorKind
  constructor(kind: GeminiErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export function isModelName(name: string): boolean {
  return MODEL.test(name)
}

async function call(path: string, key: string, init: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${GEMINI_BASE}/${path}`, {
      ...init,
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new GeminiError('network', 'Could not reach Gemini. Check the connection and try again.')
  }
  if (res.ok) return res.json()
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null
  const reason = `${body?.error?.status ?? ''} ${body?.error?.message ?? ''}`
  if (res.status === 429) throw new GeminiError('quota', 'Gemini says this key is over its quota. Wait a minute, or check the key’s limits in Google AI Studio.')
  if (res.status === 404) throw new GeminiError('model', 'Gemini does not know this model. Choose another model in the guide’s settings.')
  if (res.status === 401 || res.status === 403 || /API_KEY|API key/i.test(reason))
    throw new GeminiError('key', 'Gemini did not accept this API key.')
  throw new GeminiError('answer', `Gemini answered with an error (${res.status}). Try again in a moment.`)
}

/** Checks the key and model with a cheap request that uses no tokens. */
export async function checkKey(key: string, model: string, signal?: AbortSignal): Promise<void> {
  if (!isModelName(model)) throw new GeminiError('model', 'That is not a model name.')
  await call(`models/${model}`, key, { method: 'GET' }, signal)
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

/** One turn of the conversation, oldest first; the last one is the user's new message. */
export interface Turn {
  role: 'user' | 'model'
  text: string
}

/** At most this many earlier turns are sent, so long chats stay cheap. */
export const MAX_TURNS = 16

/** Sends the conversation and returns the model's JSON, checked against the intent schema. */
export async function askGemini(
  key: string,
  model: string,
  system: string,
  turns: readonly Turn[] | string,
  signal?: AbortSignal,
): Promise<Intent> {
  const history = typeof turns === 'string' ? [{ role: 'user' as const, text: turns }] : turns.slice(-MAX_TURNS)
  if (!isModelName(model)) throw new GeminiError('model', 'That is not a model name.')
  const data = (await call(
    `models/${model}:generateContent`,
    key,
    {
      method: 'POST',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
    },
    signal,
  )) as GenerateResponse
  if (data.promptFeedback?.blockReason) throw new GeminiError('blocked', 'Gemini declined to answer this message.')
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new GeminiError('answer', 'Gemini’s answer could not be read. Try saying it another way.')
  }
  const parsed = intentSchema.safeParse(json)
  if (!parsed.success) throw new GeminiError('answer', 'Gemini’s answer was not in the expected form. Try saying it another way.')
  return parsed.data
}
