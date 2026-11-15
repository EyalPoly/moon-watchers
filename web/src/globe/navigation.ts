import { addTicket, updateTicket, type Screen2State } from '../state/tickets'
import { MISSION_RANGE } from '../state/urlState'
import { formatIsoMinute, parseIsoMinute, snapToStep } from '../time'

const OPENING_UTC = '2026-10-15T08:30Z'

export function orbitUtc(search: string, ticketUtc: string): string {
  const params = new URLSearchParams(search)
  const time = params.get('orbitUtc')
  const ms = time ? parseIsoMinute(time) : null
  if (time && ms !== null && time >= MISSION_RANGE.first && time <= MISSION_RANGE.last) return formatIsoMinute(snapToStep(ms))
  return params.has('tk') || params.has('site') || params.has('t0') ? ticketUtc : OPENING_UTC
}

/** From the overview, reuse a matching plan or a blank card before opening another site. */
export function exploreSite(state: Screen2State, id: string | null, utc: string): Screen2State {
  const active = Math.max(0, state.open)
  let next = state
  let target = active
  if (id !== null) {
    target = state.tickets.findIndex(t => t.site === id && t.t0 === utc)
    if (target < 0) target = state.tickets[active].site === null ? active : state.tickets.findIndex(t => t.site === null)
    if (target < 0) { next = addTicket(state); target = next.open }
  }
  const ticket = next.tickets[target]
  // Exploring the region alone preserves a previously saved site's mission dates.
  const plan = id !== null || ticket.site === null ? { site: id, t0: utc } : {}
  return {
    ...updateTicket(next, target, { ...plan, shown: true, view: 'map', collapsed: undefined }),
    open: target,
    compare: false,
  }
}
