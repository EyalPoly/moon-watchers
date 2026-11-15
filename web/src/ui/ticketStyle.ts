import { pointLetter } from './points'
import type { CSSProperties } from 'react'

// One identity color per ticket, kept clear of lime (primary actions) and of the
// green/amber/red feasibility colors (spec §9.4). Green side lines mark the best-ranked
// ticket, so no identity color is green. With more tickets than colors, they repeat.
const COLORS = ['#38bdf8', '#f472b6', '#a78bfa', '#22d3ee', '#e879f9', '#818cf8', '#fda4af', '#93c5fd']

export function ticketColor(index: number): string {
  return COLORS[index % COLORS.length]
}

export function ticketLabel(index: number, name = ''): string {
  if (name !== '') return name
  return `Site ${pointLetter(index)}`
}

/** DOM id of a ticket's panel in the main area, for scrolling it into view. */
export const panelId = (index: number) => `ticket-panel-${index}`

export function ticketVars(index: number): CSSProperties {
  return { '--ticket': ticketColor(index) } as CSSProperties
}
