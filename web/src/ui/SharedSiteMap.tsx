import type { RankedArea } from '../api/areas'
import type { AppConfig } from '../api/config'
import type { ScoreSettings } from '../api/scoreSettings'
import { RegionOverlay, type AppliedRegion } from '../map/RegionOverlay'
import { MapLegend } from './MapLegend'
import type { Meta, Region, Site } from '../api/types'
import { AreaTool } from '../map/AreaTool'
import { CenterOn } from '../map/CenterOn'
import { PlacePoint } from '../map/PlacePoint'
import { PolarMap } from '../map/PolarMap'
import { QuickmapLegend } from './QuickmapLegend'
import { QuickmapLayer } from '../map/QuickmapLayer'
import { parallelRadiusM } from '../map/projection'
import { SitePins } from '../map/SitePins'
import type { Ticket } from '../state/tickets'
import type { MapLayer, PolygonLayer } from './LayersBox'
import { pointLetter, siteDisplayName } from './points'

interface Props {
  tickets: readonly Ticket[]
  active: number
  sites: readonly Site[]
  region: Region
  layer: MapLayer
  polygonLayer: PolygonLayer
  appliedRegion: AppliedRegion | null
  config: AppConfig
  search: string
  scoreSpec: Meta['score']
  settings: ScoreSettings
  onSettingsApply: (settings: ScoreSettings) => void
  selecting: boolean
  atLimit: boolean
  onFocus: (index: number) => void
  onPlace: (id: string) => void
  onRegionClose: () => void
  onOpenAreas: (points: { site: string; name: string }[], region: AppliedRegion) => void
  /** The AI guide opened the region tool: it finds areas by itself and reports them. */
  guideRegion?: boolean
  onRanked?: (areas: RankedArea[], spacingKm: number) => void
}

export function SharedSiteMap({ tickets, active, sites, region, layer, polygonLayer, appliedRegion, config, search,
  scoreSpec, settings, onSettingsApply, selecting, atLimit, onFocus, onPlace, onRegionClose, onOpenAreas, guideRegion = false, onRanked }: Props) {
  const ticket = tickets[active]
  const labels = new Map<string, string[]>()
  const indexes = new Map<string, number>()
  tickets.forEach((t, i) => {
    if (!t.shown || !t.site) return
    const letter = pointLetter(i)
    labels.set(t.site, [...(labels.get(t.site) ?? []), letter])
    indexes.set(letter, i)
  })
  const pins = sites.filter((s) => s.source !== 'custom' || labels.has(s.id))
  const targets = pins.filter((s) => labels.has(s.id))
  const radius = parallelRadiusM(region, region.custom_area.max_lat_deg)
  const letter = pointLetter(active)
  const title = ticket.name || siteDisplayName(sites.find((s) => s.id === ticket.site)) || `Site ${letter}`
  const onSelectPin = (id: string) => {
    if (selecting) return
    const existing = labels.get(id)?.[0]
    if (existing && ticket.site !== null) onFocus(indexes.get(existing)!)
    else onPlace(id)
  }

  return (
    <section className="panel shared-map" aria-label="Sites map">
      <p className="panel-hint">{selecting
        ? 'Click grid points to outline a region.'
        : atLimit
          ? 'Site limit reached. Delete a site to add another.'
          : 'Click the map to add a site.'}</p>
      <div className="panel-body">
        <PolarMap region={region} showBoundary={selecting} themed={layer !== 'Relief'}>
          <QuickmapLayer layer={layer} />
          <QuickmapLegend layer={layer} />
          {!selecting && <RegionOverlay selection={appliedRegion} layer={polygonLayer} />}
          <MapLegend layer={layer} overlay={selecting ? 'None' : polygonLayer} hasRegion={!!appliedRegion}
            legendUrl={region.layers[0]?.legend_url} />
          <SitePins layer={layer} sites={pins} selectedId={ticket.site} labels={labels} activeLabel={letter} onSelect={onSelectPin}
            onFocus={(l) => { if (!selecting) onFocus(indexes.get(l)!) }} />
          <CenterOn sites={targets} />
          {!selecting && <PlacePoint areaRadiusM={radius} onPlace={onPlace} />}
          {selecting && <AreaTool areaRadiusM={radius} namePrefix={title} config={config} search={search} ticket={ticket} spec={scoreSpec} settings={settings} onSettingsApply={onSettingsApply} onClose={onRegionClose} onOpen={onOpenAreas}
            autoFind={guideRegion} onRanked={guideRegion ? onRanked : undefined} />}
        </PolarMap>
      </div>
      <div className="panel-foot"><span>{layer === 'Relief' ? 'LOLA south polar terrain' : `${layer} · site markers`}</span>
        <span className="mono">NASA Moon Trek / LOLA</span></div>
    </section>
  )
}
