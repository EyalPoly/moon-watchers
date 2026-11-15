import type { Region, Site } from '../api/types'
import { AreaTool } from '../map/AreaTool'
import { CenterOn } from '../map/CenterOn'
import { PlacePoint } from '../map/PlacePoint'
import { PolarMap } from '../map/PolarMap'
import { parallelRadiusM } from '../map/projection'
import { SitePins } from '../map/SitePins'
import type { Ticket } from '../state/tickets'
import type { MapLayer } from './LayersBox'
import { pointLetter, siteDisplayName } from './points'

interface Props {
  tickets: readonly Ticket[]
  active: number
  sites: readonly Site[]
  region: Region
  layer: MapLayer
  selecting: boolean
  onFocus: (index: number) => void
  onPlace: (id: string) => void
  onRegionClose: () => void
  onOpenAreas: (points: { site: string; name: string }[]) => void
}

export function SharedSiteMap({ tickets, active, sites, region, layer, selecting, onFocus, onPlace, onRegionClose, onOpenAreas }: Props) {
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
    <section className="panel shared-map" aria-label="Landing sites map">
      {(selecting || !ticket.site) && <p className="panel-hint">{selecting
        ? 'Click grid points to outline a region.'
        : `Click the map to place site ${letter}, or choose a catalog site in the calculator.`}</p>}
      <div className="panel-body">
        <PolarMap region={region} showRelief={layer === 'Relief'}>
          {layer !== 'Relief' && <p role="status" className="map-layer-status">{layer} map data is not available yet.</p>}
          <SitePins sites={pins} selectedId={ticket.site} labels={labels} activeLabel={letter} onSelect={onSelectPin}
            onFocus={(l) => { if (!selecting) onFocus(indexes.get(l)!) }} />
          <CenterOn sites={targets} />
          {!selecting && !ticket.site && <PlacePoint areaRadiusM={radius} onPlace={onPlace} />}
          {selecting && <AreaTool areaRadiusM={radius} namePrefix={title} onClose={onRegionClose} onOpen={onOpenAreas} />}
        </PolarMap>
      </div>
      <div className="panel-foot"><span>{layer === 'Relief' ? 'LOLA south polar terrain' : layer}</span>
        {layer === 'Relief' && <span className="mono">LRO / 240 m DEM</span>}</div>
    </section>
  )
}
