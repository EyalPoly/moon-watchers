import { useEffect, useRef, useState, type FormEvent } from 'react'
import { askGemini, checkKey, DEFAULT_MODEL, GeminiError, isModelName } from '../assistant/gemini'
import { systemPrompt } from '../assistant/intent'
import { forgetGuideSettings, loadGuideSettings, saveGuideSettings, type GuideSettings } from '../assistant/keyStore'
import { describePlan, intentToPlan, type Plan, type PlanContext } from '../assistant/plan'
import { HEIGHT_RANGE } from '../api/heights'
import { EMPTY_TICKET } from '../state/tickets'
import { MISSION_RANGE } from '../state/urlState'

// The AI guide: a panel on the right edge. The first time, the user adds their own Gemini
// API key; after that they type a request and the guide opens the matching site cards.

export interface AssistantPanelProps {
  open: boolean
  onClose: () => void
  ctx: PlanContext
  /** True while typed locations (custom points) use sample answers. */
  customIsSample: boolean
  /** Opens the planned sites and returns their card letters. */
  onOpen: (plan: Extract<Plan, { kind: 'open' }>) => string[]
}

interface Message {
  id: number
  from: 'user' | 'guide' | 'error'
  text: string
}

const EXAMPLES = [
  'I want to land at Sample site A',
  'Check locations for a 4-month mission to the south pole from March 2027',
  'Land at 87.5° S, 45° E with the antenna at 5 m, talking to Madrid',
]

const KEY_PAGE = 'https://aistudio.google.com/apikey'

export function AssistantPanel({ open, onClose, ctx, customIsSample, onOpen }: AssistantPanelProps) {
  const [settings, setSettings] = useState<GuideSettings | null>(loadGuideSettings)
  const [setup, setSetup] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const nextId = useRef(1)
  const abort = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages, pending])
  useEffect(() => {
    if (open && settings !== null && !setup) inputRef.current?.focus()
  }, [open, settings, setup])

  const say = (from: Message['from'], text: string) =>
    setMessages((all) => [...all, { id: nextId.current++, from, text }])

  const send = async (text: string) => {
    const message = text.trim()
    if (message === '' || settings === null || pending) return
    setDraft('')
    say('user', message)
    setPending(true)
    abort.current = new AbortController()
    try {
      const system = systemPrompt({
        sites: ctx.catalog,
        stations: ctx.stations,
        today: new Date().toISOString().slice(0, 10),
        limits: {
          firstLanding: MISSION_RANGE.first,
          lastLanding: MISSION_RANGE.last,
          minDays: 1,
          maxDays: 365,
          minHeight: HEIGHT_RANGE.min,
          maxHeight: HEIGHT_RANGE.max,
        },
        defaults: { landing: EMPTY_TICKET.t0, days: EMPTY_TICKET.days, panel: EMPTY_TICKET.panel, antenna: EMPTY_TICKET.antenna, station: 'houston' },
      })
      const intent = await askGemini(settings.key, settings.model, system, message, abort.current.signal)
      const plan = intentToPlan(intent, ctx)
      if (plan.kind === 'open') {
        const letters = onOpen(plan)
        say('guide', describePlan(plan, ctx, letters, customIsSample))
      } else {
        say('guide', [intent.reply, ...plan.notes].filter((t) => t.trim() !== '').join('\n') || 'Tell me a site, a location or the mission you have in mind.')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (e instanceof GeminiError && e.kind === 'key') setSetup(true)
      say('error', e instanceof GeminiError ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPending(false)
    }
  }

  if (!open) return null

  const showSetup = settings === null || setup
  return (
    <aside
      className="guide"
      aria-label="AI guide"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <header className="guide-head">
        <span className="guide-title"><span aria-hidden="true">✦</span> AI guide</span>
        {settings !== null && !setup && (
          <button type="button" className="link-button" onClick={() => setSetup(true)}>Key settings</button>
        )}
        <button type="button" className="guide-close" aria-label="Close the AI guide" onClick={() => onClose()}>×</button>
      </header>

      {showSetup ? (
        <KeySetup
          current={settings}
          onCancel={settings === null ? undefined : () => setSetup(false)}
          onSaved={(s) => {
            saveGuideSettings(s)
            setSettings(s)
            setSetup(false)
          }}
          onForget={() => {
            forgetGuideSettings()
            setSettings(null)
            setSetup(false)
            setMessages([])
          }}
        />
      ) : (
        <>
          <div className="guide-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
            {messages.length === 0 && (
              <div className="guide-intro">
                <p>Tell me where you want to land, or what mission you are planning, and I will open the sites in the calculator.</p>
                <p className="muted">Try:</p>
                <ul>
                  {EXAMPLES.map((example) => (
                    <li key={example}>
                      <button type="button" className="guide-example" onClick={() => void send(example)}>{example}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {messages.map((m) => (
              <p key={m.id} className={`guide-msg guide-${m.from}`}>{m.text}</p>
            ))}
            {pending && <p className="guide-msg guide-guide guide-thinking">Thinking…</p>}
          </div>
          <form
            className="guide-input"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              void send(draft)
            }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              rows={2}
              maxLength={1000}
              placeholder="e.g. a 2-week mission at Sample site B in June 2027"
              aria-label="Message to the AI guide"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
            />
            <button type="submit" disabled={pending || draft.trim() === ''}>Send</button>
          </form>
          <p className="guide-privacy muted">Your messages and the site list are sent to Google Gemini with your key.</p>
        </>
      )}
    </aside>
  )
}

interface KeySetupProps {
  current: GuideSettings | null
  onSaved: (s: GuideSettings) => void
  onCancel?: () => void
  onForget: () => void
}

function KeySetup({ current, onSaved, onCancel, onForget }: KeySetupProps) {
  const [key, setKey] = useState(current?.key ?? '')
  const [model, setModel] = useState(current?.model ?? DEFAULT_MODEL)
  const [remember, setRemember] = useState(current?.remember ?? false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const k = key.trim()
    const m = model.trim()
    if (k === '' || !isModelName(m)) return
    setChecking(true)
    setError(null)
    try {
      await checkKey(k, m)
      onSaved({ key: k, model: m, remember })
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Could not check the key. Try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <form className="guide-setup" onSubmit={(e) => void submit(e)}>
      <h2>Connect Gemini</h2>
      <p>
        The guide uses Google Gemini with your own API key. You can create a free key in{' '}
        <a href={KEY_PAGE} target="_blank" rel="noreferrer noopener">Google AI Studio</a>.
      </p>
      <label className="control">
        <span>Gemini API key</span>
        <input
          type="password"
          value={key}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setKey(e.target.value)}
          aria-invalid={error !== null}
          aria-label="Gemini API key"
        />
      </label>
      <label className="guide-check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this device
      </label>
      <details className="guide-advanced">
        <summary>Model</summary>
        <label className="control">
          <span>Gemini model</span>
          <input type="text" value={model} spellCheck={false} onChange={(e) => setModel(e.target.value)} aria-label="Gemini model" aria-invalid={!isModelName(model.trim())} />
        </label>
      </details>
      {error !== null && <p className="field-error" role="alert">{error}</p>}
      <p className="muted guide-small">
        The key stays in this browser and goes only to Google. {remember ? 'It is kept until you forget it.' : 'It is forgotten when you close this tab.'}
      </p>
      <div className="guide-actions">
        <button type="submit" disabled={checking || key.trim() === '' || !isModelName(model.trim())}>
          {checking ? 'Checking…' : 'Connect'}
        </button>
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}
        {current !== null && <button type="button" className="link-button" onClick={onForget}>Forget key</button>}
      </div>
    </form>
  )
}
