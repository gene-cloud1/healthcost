export type ProviderKind = '보건소' | '의원' | '병원' | '종합병원' | '상급종합병원'

export type NonBenefitProvider = {
  ykiho: string
  name: string
  kind: ProviderKind
  item: string
  district: string
  address: string
  lat: number
  lng: number
  priceMin: number
  priceMax: number
  updated: string
}

export type SearchResult = NonBenefitProvider & {
  distanceKm: number | null
}
