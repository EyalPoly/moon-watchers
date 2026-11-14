import { get, transform, type Projection } from 'ol/proj'
import { register } from 'ol/proj/proj4'
import proj4 from 'proj4'
import type { Region } from '../api/types'

export function registerRegionProjection(region: Region): Projection {
  proj4.defs(region.crs, region.proj4)
  register(proj4)
  const projection = get(region.crs)
  if (projection === null) throw new Error(`projection ${region.crs} did not register`)
  projection.setExtent(region.extent_m)
  return projection
}

export function parallelRadiusM(region: Region, latDeg: number): number {
  // Callers may run before any map has registered the region's projection.
  if (get(region.crs) === null) registerRegionProjection(region)
  const [x, y] = transform([0, latDeg], 'EPSG:4326', region.crs)
  return Math.hypot(x, y)
}
