import { PRESETS, type StationPreset } from '../api/stations'

// The three ESA deep-space antenna locations come from the project's estrack_v07.bsp,
// rounded to the precision accepted by the existing custom-station input.
const ESTRACK: StationPreset[] = [
  { id: 'new_norcia', name: 'New Norcia (Australia)', point: { lat_deg: -31.0482, lon_deg: 116.1915, alt_m: 251.9, min_el_deg: 0 } },
  { id: 'cebreros', name: 'Cebreros (Spain)', point: { lat_deg: 40.4527, lon_deg: -4.3675, alt_m: 793.7, min_el_deg: 0 } },
  { id: 'malargue', name: 'Malargüe (Argentina)', point: { lat_deg: -35.776, lon_deg: -69.3982, alt_m: 1549.6, min_el_deg: 0 } },
]

export function stationNetworks(presets: readonly StationPreset[]) {
  const lookup = (fallback: StationPreset) => presets.find((p) => p.id === fallback.id) ?? fallback
  return [
    { name: 'NASA Deep Space Network', stations: PRESETS.filter((p) => p.id !== 'houston').map(lookup) },
    { name: 'ESA ESTRACK', stations: ESTRACK.map(lookup) },
  ]
}

export function displayPresets(presets: readonly StationPreset[]) {
  return [...presets, ...ESTRACK.filter((p) => !presets.some((entry) => entry.id === p.id))]
}
