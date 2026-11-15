import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import sampleA from '@samples/summary/sample_a.json'
import sampleC from '@samples/summary/sample_c.json'
import meta from '@samples/meta.json'
import sites from '@samples/sites.json'
import { SCORE_DEFAULTS } from '../api/scoreSettings'
import type { Meta, Site, Summary } from '../api/types'
import { CompareView } from './CompareView'

const summaries = [sampleA, sampleC, { ...sampleA, metrics: { ...sampleA.metrics, sun_pct: 10 } }] as Summary[]

vi.mock('../state/queries', () => ({
  useSummaries: () => summaries.map((data) => ({ data, isError: false, refetch: () => {} })),
  useMeta: () => ({ data: meta as Meta }),
}))

afterEach(cleanup)

const site = (sites as { sites: Site[] }).sites[0]
const ticket = (n: number) => ({ site: site.id, t0: '2027-03-01T00:00Z', days: 30, panel: 2, antenna: 3, station: { kind: 'preset', id: 'houston' }, name: '', shown: true, n })

test('a null cell says unavailable with its reason and never gets the best mark', () => {
  render(
    <CompareView
      tickets={[ticket(1), ticket(2), ticket(3)] as never}
      sitesById={new Map([[site.id, site]])}
      config={{ api_base: '', sources: { sites: 'sample', horizon: 'sample', summary: 'sample' } } as never}
      search=""
      settings={SCORE_DEFAULTS}
      isSample={false}
      onClose={() => {}}
      onOpenTicket={() => {}}
    />,
  )
  const row = screen.getByText('Sun visible').closest('tr') as HTMLElement
  const cells = within(row).getAllByRole('cell')
  expect(cells[1].textContent).toContain('unavailable')
  expect(cells[1].textContent).toContain('terrain unknown for 15.7 h')
  expect(within(cells[1]).queryByLabelText('best')).toBeNull()
  expect(within(cells[0]).getByLabelText('best')).toBeTruthy()
})
