// Where the user's Gemini key lives in this browser. By default only for this tab
// (sessionStorage); with "Remember on this device", in localStorage. Never in the URL.

import { DEFAULT_MODEL, isModelName } from './gemini'

const KEY = 'moon-watchers.gemini-key'
const MODEL = 'moon-watchers.gemini-model'

export interface GuideSettings {
  key: string
  model: string
  remember: boolean
}

function read(storage: () => Storage, name: string): string | null {
  try {
    return storage().getItem(name)
  } catch {
    return null
  }
}

function write(storage: () => Storage, name: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(name)
    else storage().setItem(name, value)
  } catch {
    /* Storage blocked: the key lasts until the page is closed. */
  }
}

const local = () => window.localStorage
const session = () => window.sessionStorage

export function loadGuideSettings(): GuideSettings | null {
  const remembered = read(local, KEY)
  const key = remembered ?? read(session, KEY)
  if (key === null || key === '') return null
  const model = read(remembered !== null ? local : session, MODEL)
  return { key, model: model !== null && isModelName(model) ? model : DEFAULT_MODEL, remember: remembered !== null }
}

export function saveGuideSettings(s: GuideSettings) {
  forgetGuideSettings()
  const storage = s.remember ? local : session
  write(storage, KEY, s.key)
  write(storage, MODEL, s.model)
}

export function forgetGuideSettings() {
  for (const storage of [local, session]) {
    write(storage, KEY, null)
    write(storage, MODEL, null)
  }
}
