import { afterEach, describe, expect, it, vi } from 'vitest'
import { askGemini, checkKey, GEMINI_BASE, GeminiError } from './gemini'

const answer = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const modelText = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })

afterEach(() => vi.unstubAllGlobals())

describe('askGemini', () => {
  it('sends the key in a header, never in the URL, and asks for JSON', async () => {
    const fetch = answer(modelText('{"action":"open","points":[{"site_id":"sample_a"}],"reply":"Opening A."}'))
    vi.stubGlobal('fetch', fetch)
    const intent = await askGemini('secret-key', 'gemini-3.5-flash-lite', 'system', 'land at A')
    expect(intent).toEqual({ action: 'open', points: [{ site_id: 'sample_a' }], reply: 'Opening A.' })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GEMINI_BASE}/models/gemini-3.5-flash-lite:generateContent`)
    expect(url).not.toContain('secret-key')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key')
    const body = JSON.parse(String(init.body))
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.systemInstruction.parts[0].text).toBe('system')
    expect(body.contents[0].parts[0].text).toBe('land at A')
  })

  it('names a rejected key', async () => {
    vi.stubGlobal('fetch', answer({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }, 400))
    await expect(askGemini('bad', 'gemini-3.5-flash-lite', 's', 'm')).rejects.toMatchObject({ kind: 'key' })
  })

  it('names quota and unknown-model errors', async () => {
    vi.stubGlobal('fetch', answer({ error: { status: 'RESOURCE_EXHAUSTED' } }, 429))
    await expect(askGemini('k', 'gemini-3.5-flash-lite', 's', 'm')).rejects.toMatchObject({ kind: 'quota' })
    vi.stubGlobal('fetch', answer({ error: { status: 'NOT_FOUND' } }, 404))
    await expect(askGemini('k', 'gemini-0', 's', 'm')).rejects.toMatchObject({ kind: 'model' })
  })

  it('refuses an answer that is not the agreed JSON', async () => {
    vi.stubGlobal('fetch', answer(modelText('Sure! I opened it.')))
    await expect(askGemini('k', 'gemini-3.5-flash-lite', 's', 'm')).rejects.toMatchObject({ kind: 'answer' })
    vi.stubGlobal('fetch', answer(modelText('{"action":"launch","reply":"x"}')))
    await expect(askGemini('k', 'gemini-3.5-flash-lite', 's', 'm')).rejects.toMatchObject({ kind: 'answer' })
  })

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(askGemini('k', 'gemini-3.5-flash-lite', 's', 'm')).rejects.toBeInstanceOf(GeminiError)
  })

  it('never sends a model name that could change the path', async () => {
    const fetch = answer({})
    vi.stubGlobal('fetch', fetch)
    await expect(askGemini('k', '../files', 's', 'm')).rejects.toMatchObject({ kind: 'model' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('checkKey', () => {
  it('asks for the model description, which costs no tokens', async () => {
    const fetch = answer({ name: 'models/gemini-3.5-flash-lite' })
    vi.stubGlobal('fetch', fetch)
    await checkKey('k', 'gemini-3.5-flash-lite')
    expect(fetch.mock.calls[0][0]).toBe(`${GEMINI_BASE}/models/gemini-3.5-flash-lite`)
    expect((fetch.mock.calls[0][1] as RequestInit).method).toBe('GET')
  })
})
