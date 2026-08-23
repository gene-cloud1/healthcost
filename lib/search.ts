import { haversineKm } from './geo'
import type { NonBenefitProvider, SearchResult } from './types'

export type SearchParams = {
  district?: string
  lat?: number
  lng?: number
  sort?: 'price' | 'distance'
}

export function searchProviders(providers: NonBenefitProvider[], params: SearchParams): SearchResult[] {
  const { district, lat, lng, sort = 'price' } = params
  const hasCoords = typeof lat === 'number' && typeof lng === 'number'

  const filtered = district ? providers.filter((p) => p.district === district) : providers

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
