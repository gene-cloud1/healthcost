import { describe, it, expect } from 'vitest'
import { searchProviders } from './search'
import type { NonBenefitProvider } from './types'

const sample: NonBenefitProvider[] = [
  { ykiho: 'A', name: '가까운의원', kind: '의원', district: '강남구', address: '', lat: 37.50, lng: 127.03, priceMin: 30000, priceMax: 30000, updated: '2026.08.01' },
  { ykiho: 'B', name: '먼병원', kind: '병원', district: '강남구', address: '', lat: 37.60, lng: 127.10, priceMin: 20000, priceMax: 20000, updated: '2026.08.01' },
  { ykiho: 'C', name: '다른구의원', kind: '의원', district: '서초구', address: '', lat: 37.48, lng: 127.02, priceMin: 10000, priceMax: 10000, updated: '2026.08.01' },
]

describe('searchProviders', () => {
  it('district로 필터링한다', () => {
    const result = searchProviders(sample, { district: '강남구' })
    expect(result.map((r) => r.ykiho).sort()).toEqual(['A', 'B'])
  })

  it('sort가 price면 낮은 가격순으로 정렬한다', () => {
    const result = searchProviders(sample, { district: '강남구', sort: 'price' })
    expect(result.map((r) => r.ykiho)).toEqual(['B', 'A'])
  })

  it('좌표가 있고 sort가 distance면 가까운 순으로 정렬하고 distanceKm을 채운다', () => {
    const result = searchProviders(sample, { district: '강남구', sort: 'distance', lat: 37.50, lng: 127.03 })
    expect(result[0].ykiho).toBe('A')
    expect(result[0].distanceKm).toBeCloseTo(0, 1)
    expect(result[1].distanceKm).toBeGreaterThan(0)
  })

  it('좌표가 없으면 distanceKm은 null이다', () => {
    const result = searchProviders(sample, { district: '강남구' })
    expect(result.every((r) => r.distanceKm === null)).toBe(true)
  })
})
