// The AI guide's reference notes, written from the code (each note names its source files).
// The guide sees this index on every message and asks for the notes it needs ("lookup");
// the app then sends those notes and asks again.

import aiGuide from './ai-guide.md?raw'
import appOverview from './app-overview.md?raw'
import dataSources from './data-sources.md?raw'
import metrics from './metrics.md?raw'
import regionTool from './region-tool.md?raw'
import score from './score.md?raw'
import siteCard from './site-card.md?raw'
import southPoleScreen from './south-pole-screen.md?raw'
import timelinesScreen from './timelines-screen.md?raw'
import visibility from './visibility.md?raw'
import warnings from './warnings.md?raw'

export interface KnowledgeTopic {
  id: string
  title: string
  /** When the guide should read it. */
  about: string
  text: string
}

export const TOPICS: readonly KnowledgeTopic[] = [
  { id: 'app-overview', title: 'What the app does', about: 'screens (Orbit, Site Calculator, Timelines), sites, scenarios, what the numbers are and are not', text: appOverview },
  { id: 'south-pole-screen', title: 'Site Calculator screen', about: 'every button: map view, click to add, ridge graph, Grading Weights, Manual Selection, map and polygon layers, add site, sort, compare, the guide window', text: southPoleScreen },
  { id: 'site-card', title: 'A site card', about: 'card fields, apply, +29.5 d, heights, stations, live panel, whole-mission results', text: siteCard },
  { id: 'timelines-screen', title: 'Timelines screen', about: 'the Gantt rows, mission days, the compare table', text: timelinesScreen },
  { id: 'region-tool', title: 'Manual Selection', about: 'step-by-step use of the region tool and its best areas', text: regionTool },
  { id: 'visibility', title: 'Sunlight and contact', about: 'skyline, terrain data, Sun disk fraction, Earth contact rule, clearance', text: visibility },
  { id: 'metrics', title: 'Metrics and chips', about: 'mission window, every metric, unavailable values, chip thresholds', text: metrics },
  { id: 'score', title: 'Score and weights', about: 'the 7 grades, formula, points lost, gates, presets, settings, advising on weights', text: score },
  { id: 'warnings', title: 'Warnings', about: 'every warning code, its meaning and what to do; explaining a low score', text: warnings },
  { id: 'data-sources', title: 'Data and limits', about: 'NASA data sources, the 30-site catalog, limits of the app', text: dataSources },
  { id: 'ai-guide', title: 'The AI guide', about: 'what the guide can do, the API key, advisor and direct modes', text: aiGuide },
]

export const TOPIC_IDS = TOPICS.map((t) => t.id)

export function topicIndex(): string {
  return TOPICS.map((t) => `- ${t.id}: ${t.title} (${t.about})`).join('\n')
}

/** The notes for the given ids, in index order; unknown ids are ignored. */
export function topicTexts(ids: readonly string[]): { ids: string[]; text: string } {
  const chosen = TOPICS.filter((t) => ids.includes(t.id))
  return { ids: chosen.map((t) => t.id), text: chosen.map((t) => `=== ${t.id} ===\n${t.text.trim()}`).join('\n\n') }
}
