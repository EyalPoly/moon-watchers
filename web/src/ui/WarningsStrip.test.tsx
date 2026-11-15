import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import meta from '@samples/meta.json'
import type { Meta, Summary } from '../api/types'
import { WarningsStrip } from './WarningsStrip'

afterEach(cleanup)

const catalog = (meta as Meta).warning_catalog
type W = Summary['warnings'][number]
const w = (code: string, severity: W['severity'] = 'info'): W => ({ code, text: `text of ${code}`, severity, affects: 'all' })

test('an empty list renders nothing', () => {
  const { container } = render(<WarningsStrip warnings={[]} catalog={catalog} />)
  expect(container.firstChild).toBeNull()
})

test('four warnings show two in full, the blocking one first, and "+2 more"', () => {
  render(<WarningsStrip warnings={[w('A'), w('B', 'caution'), w('C'), w('EXCLUDED_PSR', 'blocking')]} catalog={catalog} />)
  const items = screen.getAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(items[0].textContent).toContain('text of EXCLUDED_PSR')
  expect(screen.getByRole('button', { name: '+2 more' })).toBeTruthy()
})

test('a strip limited to one shows the blocking warning in full and counts the rest', () => {
  render(<WarningsStrip warnings={[w('A'), w('EXCLUDED_PSR', 'blocking'), w('C')]} catalog={catalog} visible={1} />)
  const items = screen.getAllByRole('listitem')
  expect(items).toHaveLength(1)
  expect(items[0].textContent).toContain('text of EXCLUDED_PSR')
  expect(screen.getByRole('button', { name: '+2 more' })).toBeTruthy()
})

test('"+2 more" opens the full list', () => {
  render(<WarningsStrip warnings={[w('A'), w('B', 'caution'), w('C'), w('D')]} catalog={catalog} />)
  fireEvent.click(screen.getByRole('button', { name: '+2 more' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(4)
})

test('a code missing from the catalog shows its raw code and text', () => {
  render(<WarningsStrip warnings={[w('FOO')]} catalog={catalog} />)
  expect(screen.getByText('FOO')).toBeTruthy()
  expect(screen.getByText('text of FOO')).toBeTruthy()
})

test('a catalogued code is not repeated as a raw code', () => {
  render(<WarningsStrip warnings={[w('NULL_GRADE:light', 'caution')]} catalog={catalog} />)
  expect(screen.queryByText('NULL_GRADE:light')).toBeNull()
})

test('"Always true" lists the three standing notes', () => {
  render(<WarningsStrip warnings={[w('A')]} catalog={catalog} />)
  fireEvent.click(screen.getByRole('button', { name: /Always true/ }))
  const standing = catalog.filter((c) => c.standing)
  expect(standing).toHaveLength(3)
  for (const s of standing) expect(screen.getByText(s.text)).toBeTruthy()
})

test('before the catalog loads, warnings still render their own text with no raw code, blocking first', () => {
  render(<WarningsStrip warnings={[w('DEM_GAPS', 'caution'), w('EXCLUDED_PSR', 'blocking')]} catalog={[]} />)
  const items = screen.getAllByRole('listitem')
  expect(items[0].textContent).toContain('text of EXCLUDED_PSR')
  expect(screen.queryByText('EXCLUDED_PSR')).toBeNull()
  expect(screen.queryByText('DEM_GAPS')).toBeNull()
})

test('with a loaded catalog an unknown code still shows raw', () => {
  render(<WarningsStrip warnings={[w('FOO')]} catalog={catalog} />)
  expect(screen.getByText('FOO')).toBeTruthy()
})
