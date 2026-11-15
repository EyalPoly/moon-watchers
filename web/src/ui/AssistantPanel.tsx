import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { AppConfig } from '../api/config'
import { HEIGHT_RANGE } from '../api/heights'
import type { ScoreSettings } from '../api/scoreSettings'
import { stationLabel } from '../api/stations'
import type { Scenario, Site } from '../api/types'
import { describeAppState, type CardState } from '../assistant/appState'
import { askGemini, checkKey, DEFAULT_MODEL, GeminiError, isModelName, type Turn } from '../assistant/gemini'
import { systemPrompt, type GuideMode, type Intent } from '../assistant/intent'
import { forgetGuideSettings, loadGuideSettings, saveGuideSettings, type GuideSettings } from '../assistant/keyStore'
import { TOPICS, topicIndex, topicTexts } from '../assistant/knowledge'
import { describePlan, intentToPlan, type Plan, type PlanContext } from '../assistant/plan'
import { adviseScore, describeChanges } from '../assistant/scoreAdvice'
import { useSummaries } from '../state/queries'
import { toScenario } from '../state/scenario'
import type { AppScreen } from '../state/screen'
import { EMPTY_TICKET, type Ticket } from '../state/tickets'
import { MISSION_RANGE } from '../state/urlState'
import { pointLetter, siteDisplayName } from './points'

// The AI guide: a panel on the right edge. The first time, the user adds their own Gemini
// API key. After that the guide opens sites, explains numbers, buttons and warnings from
// the app's own results and reference notes, asks back, suggests score weights and opens
// the region tool.

export interface AssistantPanelProps {
  open: boolean
  onClose: () => void
  ctx: PlanContext
  /** True while typed locations (custom points) use sample answers. */
  customIsSample: boolean
  /** Opens the planned sites and returns their card letters. */
  onOpen: (plan: Extract<Plan, { kind: 'open' }>) => string[]
  // What the user sees, for the guide's APP STATE.
  tickets: readonly Ticket[]
  sitesById: ReadonlyMap<string, Site>
  settings: ScoreSettings
  config: AppConfig
  search: string
  screen: AppScreen
  explorer: 'map' | 'graph'
  regionToolOpen: boolean
  activeIndex: number
  /** Applies new score settings (one history step). */
  onSetScore: (settings: ScoreSettings) => void
  /** Opens Select region on the map; the tool then finds the best areas by itself. */
  onOpenRegion: () => void
  /** The latest best areas found by a region tool the guide opened. */
  regionResult: { id: number; text: string } | null
}

interface Proposal {
  w: ScoreSettings['w']
  summary: string
  state: 'open' | 'applied' | 'dismissed'
}

interface Message {
  id: number
  from: 'user' | 'guide' | 'error' | 'note'
  text: string
  options?: string[]
  proposal?: Proposal
}

const EXAMPLES = [
  'I want to land at Mons Mouton',
  'Check locations for a 4-month mission to the south pole from March 2027',
  'Why is site A’s score low?',
  'I care most about communication: change the grade weights',
  'Help me find the best area near Shackleton',
  'What does the ridge graph show?',
]

const KEY_PAGE = 'https://aistudio.google.com/apikey'
const MODE_KEY = 'moon-watchers.guide-mode'

function readMode(): GuideMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'direct' ? 'direct' : 'advisor'
  } catch {
    return 'advisor'
  }
}

export function AssistantPanel(props: AssistantPanelProps) {
  const { open, onClose, ctx, customIsSample, onOpen } = props
  const [settings, setSettings] = useState<GuideSettings | null>(loadGuideSettings)
  const [setup, setSetup] = useState(false)
  const [mode, setModeState] = useState<GuideMode>(readMode)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const nextId = useRef(1)
  const abort = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const setMode = (m: GuideMode) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* Optional preference. */
    }
  }

  // The open sites' results, only while the panel is open (they are cached from the cards).
  const located = useMemo(
    () =>
      open
        ? props.tickets.flatMap((t, index) => {
            const site = t.site === null ? undefined : props.sitesById.get(t.site)
            return site ? [{ index, scenario: toScenario(site.id, t, t.station, props.settings) as Scenario }] : []
          })
        : [],
    [open, props.tickets, props.sitesById, props.settings],
  )
  const results = useSummaries(props.config, props.search, located.map((l) => l.scenario))

  const appState = () => {
    const cards: CardState[] = props.tickets.map((t, index) => {
      const site = t.site === null ? undefined : props.sitesById.get(t.site)
      const k = located.findIndex((l) => l.index === index)
      const result = k >= 0 ? results[k] : undefined
      return {
        letter: pointLetter(index),
        name: t.name || siteDisplayName(site) || `Site ${pointLetter(index)}`,
        site,
        t0: t.t0,
        days: t.days,
        panel: t.panel,
        antenna: t.antenna,
        station: stationLabel(t.station, ctx.stations),
        shown: t.shown,
        summary: result?.data,
        pending: result?.isPending ?? false,
      }
    })
    return describeAppState({
      screen: props.screen,
      explorer: props.explorer,
      regionToolOpen: props.regionToolOpen,
      activeLetter: pointLetter(props.activeIndex),
      cards,
      settings: props.settings,
    })
  }

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages, pending])
  useEffect(() => {
    if (open && settings !== null && !setup) inputRef.current?.focus()
  }, [open, settings, setup])

  const say = (from: Message['from'], text: string, extra: Partial<Message> = {}) =>
    setMessages((all) => [...all, { id: nextId.current++, from, text, ...extra }])

  // Best areas from a region tool the guide opened arrive as a guide message.
  const lastRegion = useRef<number | null>(null)
  useEffect(() => {
    if (!props.regionResult || props.regionResult.id === lastRegion.current) return
    lastRegion.current = props.regionResult.id
    say('guide', props.regionResult.text)
  }, [props.regionResult])

  const act = (intent: Intent) => {
    switch (intent.action) {
      case 'open':
      case 'explore': {
        const plan = intentToPlan(intent, ctx)
        if (plan.kind === 'open') say('guide', describePlan(plan, ctx, onOpen(plan), customIsSample))
        else say('guide', [intent.reply, ...plan.notes].filter((t) => t.trim() !== '').join('\n') || 'Tell me a site, a location or the mission you have in mind.')
        return
      }
      case 'set_score': {
        const advice = adviseScore(intent, props.settings)
        if (advice.ok === false) {
          say('guide', `${intent.reply}\n(${advice.reason} Nothing was changed.)`.trim())
          return
        }
        const summary = `${advice.preset ? `${advice.preset} preset: ` : ''}${describeChanges(advice.changes)}`
        if (advice.changes.length === 0) {
          say('guide', `${intent.reply}\nThese are already the current weights.`.trim())
        } else if (mode === 'direct') {
          props.onSetScore(advice.settings)
          say('guide', `${intent.reply}\nApplied: ${summary}. Back undoes it; Score settings can reset it.`.trim())
        } else {
          say('guide', `${intent.reply}\nSuggested: ${summary}.`.trim(), { proposal: { w: advice.settings.w, summary, state: 'open' } })
        }
        return
      }
      case 'open_region':
        props.onOpenRegion()
        say('guide', intent.reply || 'Select region is open. Click grid points around the area; I will find the best areas once there are three.')
        return
      case 'ask':
        say('guide', intent.reply, { options: intent.options?.filter((o) => o.trim() !== '') })
        return
      default:
        say('guide', intent.reply || 'I could not find an answer to that.')
    }
  }

  const send = async (text: string) => {
    const message = text.trim()
    if (message === '' || settings === null || pending !== null) return
    setDraft('')
    // The conversation so far (the guide's own replies as the model's turns), then this message.
    const turns: Turn[] = [
      ...messages.flatMap((m): Turn[] =>
        m.from === 'user' ? [{ role: 'user', text: m.text }] : m.from === 'guide' ? [{ role: 'model', text: m.text }] : [],
      ),
      { role: 'user', text: message },
    ]
    say('user', message)
    setPending('Thinking…')
    abort.current = new AbortController()
    try {
      const base = {
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
        topicIndex: topicIndex(),
        appState: appState(),
        mode,
      }
      let intent = await askGemini(settings.key, settings.model, systemPrompt(base), turns, abort.current.signal)
      if (intent.action === 'lookup') {
        const reference = topicTexts(intent.topics ?? [])
        if (reference.ids.length > 0) {
          const titles = TOPICS.filter((t) => reference.ids.includes(t.id)).map((t) => t.title)
          setPending(`Reading: ${titles.join(', ')}…`)
          intent = await askGemini(settings.key, settings.model, systemPrompt({ ...base, reference }), turns, abort.current.signal)
        }
        // A second lookup is answered with what it has.
        if (intent.action === 'lookup') intent = { ...intent, action: 'answer' }
      }
      act(intent)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (e instanceof GeminiError && e.kind === 'key') setSetup(true)
      say('error', e instanceof GeminiError ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPending(null)
    }
  }

  const decide = (id: number, state: 'applied' | 'dismissed') => {
    const message = messages.find((m) => m.id === id)
    if (!message?.proposal || message.proposal.state !== 'open') return
    if (state === 'applied') props.onSetScore({ ...props.settings, w: message.proposal.w })
    setMessages((all) => all.map((m) => (m.id === id && m.proposal ? { ...m, proposal: { ...m.proposal, state } } : m)))
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
          <div className="guide-mode" role="group" aria-label="When the guide changes score weights">
            <span className="muted">Score changes:</span>
            <button type="button" aria-pressed={mode === 'advisor'} onClick={() => setMode('advisor')} title="The guide suggests weights; you press Apply">Advisor</button>
            <button type="button" aria-pressed={mode === 'direct'} onClick={() => setMode('direct')} title="The guide applies weights right away">Direct</button>
          </div>
          <div className="guide-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
            {messages.length === 0 && (
              <div className="guide-intro">
                <p>I can open sites, explain any number, button or warning, suggest score weights for your priorities, and help you search an area.</p>
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
              <div key={m.id} className={`guide-msg guide-${m.from}`}>
                <p>{m.text}</p>
                {m.options && m.options.length > 0 && (
                  <div className="guide-options" role="group" aria-label="Suggested answers">
                    {m.options.map((o) => (
                      <button key={o} type="button" className="guide-option" disabled={pending !== null} onClick={() => void send(o)}>{o}</button>
                    ))}
                  </div>
                )}
                {m.proposal && (
                  <div className="guide-proposal">
                    {m.proposal.state === 'open' ? (
                      <>
                        <button type="button" className="guide-apply" onClick={() => decide(m.id, 'applied')}>Apply weights</button>
                        <button type="button" className="link-button" onClick={() => decide(m.id, 'dismissed')}>Dismiss</button>
                      </>
                    ) : (
                      <span className="muted">{m.proposal.state === 'applied' ? 'Applied. Back undoes it.' : 'Dismissed.'}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {pending !== null && <p className="guide-msg guide-guide guide-thinking">{pending}</p>}
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
              placeholder="Ask about a site, a number or a button, or describe a mission"
              aria-label="Message to the AI guide"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
            />
            <button type="submit" disabled={pending !== null || draft.trim() === ''}>Send</button>
          </form>
          <p className="guide-privacy muted">Your messages, the sites and their results are sent to Google Gemini with your key.</p>
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
