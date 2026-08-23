import { describe, it, expect } from 'vitest'
import { haversineKm } from './geo'

describe('haversineKm', () => {
  it('같은 좌표는 거리 0을 반환한다', () => {
    expect(haversineKm(37.5, 127.0, 37.5, 127.0)).toBe(0)
  })

  it('서울시청과 강남역 사이 거리를 대략 맞게 계산한다 (직선거리 약 8~9km)', () => {
    const d = haversineKm(37.5663, 126.9779, 37.4979, 127.0276)
    expect(d).toBeGreaterThan(7)
    expect(d).toBeLessThan(10)
  })
})
