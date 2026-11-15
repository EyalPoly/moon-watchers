// Which screen is showing. It lives in the URL beside the sites, so a Timelines link opens
// on the Timelines screen and Back returns to the South pole screen.

export type AppScreen = 'orbit' | 'south_pole' | 'timelines'

export function parseScreen(search: string): AppScreen {
  const screen = new URLSearchParams(search).get('screen')
  return screen === 'timelines' || screen === 'orbit' ? screen : 'south_pole'
}

/** The query string with the screen set; the South pole screen is the default and isn't written. */
export function withScreen(search: string, screen: AppScreen): string {
  const params = new URLSearchParams(search)
  if (screen === 'south_pole') params.delete('screen')
  else params.set('screen', screen)
  // Screen 2's own compare table is replaced by the Timelines screen.
  params.delete('view')
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}
