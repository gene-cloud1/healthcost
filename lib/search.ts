import { haversineKm } from './geo.js'
import type { NonBenefitProvider, SearchResult } from './types.js'

export type SearchParams = {
  item?: string
  district?: string
  lat?: number
  lng?: number
  sort?: 'price' | 'distance'
}

export function searchProviders(providers: NonBenefitProvider[], params: SearchParams): SearchResult[] {
  const { item, district, lat, lng, sort = 'price' } = params
  const hasCoords = typeof lat === 'number' && typeof lng === 'number'

  const filtered = providers.filter(
    (p) => (!item || p.item === item) && (!district || p.district === district),
  )

  const withDistance: SearchResult[] = filtered.map((p) => ({
    ...p,
    distanceKm: hasCoords ? haversineKm(lat!, lng!, p.lat, p.lng) : null,
  }))

  return withDistance.sort((a, b) => {
    if (sort === 'distance' && hasCoords) {
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    }
    return a.priceMin - b.priceMin
  })
}
