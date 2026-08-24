import { useEffect, useMemo, useRef, useState } from 'react'
import './index.css'
import { searchProviders } from '../lib/search'
import type { NonBenefitProvider, SearchResult } from '../lib/types'
import { regionMap } from '../data/regions'

type Sort = 'price' | 'distance'

type SearchCatalog = {
  items: string[]
  districtFiles: Record<string, string>
}

const SIDO_NAMES = Object.keys(regionMap)

// 실제 심평원 데이터의 공식 항목명은 "인플루엔자 예방접종료"처럼 구어체와 겹치는 글자가
// 거의 없는 경우가 많아서, 자주 쓰는 구어체 몇 개만 힌트로 매핑해둔다. 나머지는 실제
// 항목명과의 직접 부분일치로 매칭된다 (§6 로드맵의 임베딩 기반 의미 검색 전까지의 임시 대체).
const ALIAS_HINTS: Record<string, string[]> = {
  독감주사: ['인플루엔자'],
  '독감 예방접종': ['인플루엔자'],
  독감백신: ['인플루엔자'],
  알러지검사: ['알레르기'],
  '알레르기 검사': ['알레르기'],
  알러지: ['알레르기'],
}

const normalize = (s: string) => s.replaceAll(' ', '').toLowerCase()

function matchItems(query: string, options: string[]): string[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const normalizedQuery = normalize(trimmed)
  const hints = ALIAS_HINTS[trimmed]?.map(normalize) ?? []
  return options.filter((option) => {
    const normalizedOption = normalize(option)
    if (normalizedOption.includes(normalizedQuery) || normalizedQuery.includes(normalizedOption)) return true
    return hints.some((hint) => normalizedOption.includes(hint))
  })
}

const formatPrice = (price: number) => (price === 0 ? '무료' : `${price.toLocaleString()}원`)

export default function App() {
  const [query, setQuery] = useState('독감주사')
  const [itemOptions, setItemOptions] = useState<string[]>([])
  const [catalog, setCatalog] = useState<SearchCatalog | null>(null)
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<string[]>([])
  const [city, setCity] = useState('서울특별시')
  const [district, setDistrict] = useState('강남구')
  const [neighborhood, setNeighborhood] = useState('역삼동')
  const [sort, setSort] = useState<Sort>('price')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState('직접 선택한 지역 사용 중')
  const [notice, setNotice] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const districtCache = useRef(new Map<string, NonBenefitProvider[]>())

  const queryMatches = useMemo(() => matchItems(query, itemOptions), [query, itemOptions])

  useEffect(() => {
    fetch('/search/catalog.json', { cache: 'force-cache' })
      .then((res) => res.json())
      .then((data: SearchCatalog) => {
        setCatalog(data)
        setItemOptions(data.items ?? [])
      })
      .catch(() => setNotice('검색 가능한 항목 목록을 불러오지 못했어요.'))
  }, [])

  useEffect(() => {
    if (selectedItem || itemOptions.length === 0) return
    const initialMatches = matchItems(query, itemOptions)
    setSelectedItem(initialMatches[0] ?? itemOptions[0])
  }, [itemOptions, query, selectedItem])

  useEffect(() => {
    if (!selectedItem || !catalog) return
    let cancelled = false
    setLoading(true)
    const key = `${city}|${district}`
    const filePath = catalog.districtFiles[key]

    if (!filePath) {
      setResults([])
      setLoading(false)
      setNotice(`${city} ${district}의 가격 데이터를 찾지 못했어요.`)
      return () => {
        cancelled = true
      }
    }

    const cached = districtCache.current.get(key)
    const providers = cached
      ? Promise.resolve(cached)
      : fetch(`/search/${filePath}`, { cache: 'force-cache' })
          .then((res) => {
            if (!res.ok) throw new Error('district data request failed')
            return res.json() as Promise<NonBenefitProvider[]>
          })
          .then((data) => {
            districtCache.current.set(key, data)
            return data
          })

    providers
      .then((data) => {
        if (cancelled) return
        setResults(searchProviders(data, { item: selectedItem, sort, lat: coords?.lat, lng: coords?.lng }))
      })
      .catch(() => {
        if (!cancelled) setNotice('결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [catalog, selectedItem, city, district, sort, coords])

  const search = () => {
    if (!query.trim()) {
      setNotice('찾고 싶은 진료 항목을 입력해 주세요.')
      setCandidates([])
      return
    }
    if (queryMatches.length === 1) {
      setSelectedItem(queryMatches[0])
      setCandidates([])
      setNotice(`"${queryMatches[0]}" 항목으로 비교 결과를 보여드려요.`)
    } else if (queryMatches.length > 1) {
      setCandidates(queryMatches.slice(0, 8))
      setNotice('여러 항목이 검색됐어요. 아래에서 원하는 항목을 선택해 주세요.')
    } else {
      setCandidates([])
      setNotice('정확한 항목을 찾지 못했어요. 표현을 바꾸거나 다른 검색어로 시도해 보세요.')
    }
  }

  const pickCandidate = (official: string) => {
    setSelectedItem(official)
    setCandidates([])
    setNotice(`"${official}" 항목으로 비교 결과를 보여드려요.`)
  }

  const selectCity = (nextCity: string) => {
    setCity(nextCity)
    const firstDistrict = Object.keys(regionMap[nextCity] ?? {})[0] ?? ''
    setDistrict(firstDistrict)
    setNeighborhood(regionMap[nextCity]?.[firstDistrict]?.[0] ?? '')
  }

  const selectDistrict = (nextDistrict: string) => {
    setDistrict(nextDistrict)
    setNeighborhood(regionMap[city]?.[nextDistrict]?.[0] ?? '')
  }

  const requestLocation = (onGranted?: () => void) => {
    if (!navigator.geolocation) {
      setLocationStatus('위치 기능을 지원하지 않는 환경')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationStatus('현재 위치를 반영했어요')
        onGranted?.()
      },
      () => {
        setCoords(null)
        setLocationStatus('위치 권한이 없어 선택한 지역 기준으로 표시 중')
      },
    )
  }

  const useDistanceSort = () => {
    if (coords) {
      setSort('distance')
      return
    }
    setLocationStatus('위치를 확인하는 중...')
    requestLocation(() => setSort('distance'))
  }

  const lowestPrice = results.length ? Math.min(...results.map((r) => r.priceMin)) : null
  const avgPrice = results.length
    ? Math.round(results.reduce((sum, r) => sum + r.priceMin, 0) / results.length)
    : null
  const maxGap =
    results.length > 1
      ? Math.max(...results.map((r) => r.priceMin)) - Math.min(...results.map((r) => r.priceMin))
      : null

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="진료비 한눈에 홈">
          <span className="brand-mark">+</span>
          <strong>진료비 한눈에</strong>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#search">진료비 비교</a>
        </nav>
      </header>
      <main id="top" className="split-layout">
        <aside className="search-sidebar" id="search">
          <div className="sidebar-intro">
            <h1>
              가까운 곳의
              <br />
              <em>진료비를 한눈에</em>
              <br />
              비교하세요.
            </h1>
          </div>
          <section className="search-card" aria-label="진료 항목 검색">
            <p className="section-label">진료 항목 찾기</p>
            <label className="search-input">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="예: 독감주사, 알러지검사"
                aria-label="진료 항목 검색"
              />
              <button onClick={search}>검색</button>
            </label>
            <p className="search-help">"독감주사"처럼 편하게 입력해 보세요.</p>
            <div className="matched-item">
              <div className="match-icon" aria-hidden="true">✓</div>
              <div>
                <small>가장 가까운 공식 항목</small>
                <strong>{selectedItem ?? '검색 중...'}</strong>
              </div>
            </div>
            {candidates.length > 0 && (
              <div className="candidate-list" aria-label="검색된 항목 후보">
                {candidates.map((candidate) => (
                  <button key={candidate} className="outline-button" onClick={() => pickCandidate(candidate)}>
                    {candidate}
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="location-card" aria-label="위치 및 지역 설정">
            <div className="location-heading">
              <p className="section-label">검색 지역</p>
              <button className="outline-button" onClick={() => requestLocation()}>내 위치 사용</button>
            </div>
            <div className="region-selects" aria-label="지역 선택">
              <label className="district-select">
                시·도
                <select value={city} onChange={(e) => selectCity(e.target.value)}>
                  {SIDO_NAMES.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="district-select">
                시·군·구
                <select value={district} onChange={(e) => selectDistrict(e.target.value)}>
                  {Object.keys(regionMap[city] ?? {}).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="district-select">
                동
                <select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}>
                  {(regionMap[city]?.[district] ?? []).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="location-block">
              <span className="pin" aria-hidden="true">●</span>
              <div>
                <b>{city} {district} {neighborhood}</b>
                <small>{coords ? '현재 위치 사용 중' : '지정 위치 사용 중'} · {locationStatus}</small>
              </div>
            </div>
          </section>
          {notice && <p className="notice" role="status">{notice}</p>}
        </aside>
        <section className="results-panel" aria-live="polite">
          <div className="results-topline">
            <div>
              <p className="section-label">{district} 기준</p>
              <h2>{selectedItem ?? '항목 미선택'} <span>비교 결과</span></h2>
            </div>
            <div className="sort-tabs" role="group" aria-label="정렬 기준">
              <button className={sort === 'price' ? 'active' : ''} onClick={() => setSort('price')}>낮은 가격순</button>
              <button
                className={sort === 'distance' ? 'active' : ''}
                title={coords ? undefined : '누르면 위치 권한을 요청해요'}
                onClick={useDistanceSort}
              >
                가까운 거리순
              </button>
            </div>
          </div>
          <div className="summary-strip">
            <div><span>가장 낮은 가격</span><strong className="free">{lowestPrice === null ? '-' : formatPrice(lowestPrice)}</strong><small>현재 비교 결과 기준</small></div>
            <div><span>평균가</span><strong>{avgPrice === null ? '-' : formatPrice(avgPrice)}</strong><small>현재 비교 결과 기준</small></div>
            <div><span>가격 차이</span><strong>{maxGap === null ? '-' : formatPrice(maxGap)}</strong><small>공개된 최저가 기준</small></div>
          </div>
          <div className="result-list">
            {loading && <p>불러오는 중...</p>}
            {!loading && selectedItem && results.length === 0 && (
              <p className="notice">아직 "{selectedItem}" · {district} 조합의 실제 데이터가 없어요. "독감주사" · 강남구로 검색해 보세요.</p>
            )}
            {results.map((provider, index) => (
              <article className={`provider-card ${provider.kind === '보건소' ? 'public' : ''}`} key={`${provider.ykiho}-${provider.item}`}>
                <div className="rank">{index + 1}</div>
                <div className="provider-main">
                  <div className="provider-title">
                    <span className={`kind ${provider.kind}`}>{provider.kind}</span>
                    <h3>{provider.name}</h3>
                  </div>
                  <p>
                    {provider.district}
                    {provider.distanceKm !== null && ` · 현재 위치에서 약 ${provider.distanceKm.toFixed(1)}km`}
                  </p>
                </div>
                <div className="price-box">
                  <strong className={provider.priceMin === 0 ? 'free' : ''}>{formatPrice(provider.priceMin)}</strong>
                  {provider.priceMax !== provider.priceMin && (
                    <small>{provider.priceMin.toLocaleString()} ~ {provider.priceMax.toLocaleString()}원</small>
                  )}
                  <small>정보 갱신 {provider.updated}</small>
                </div>
              </article>
            ))}
          </div>
          <p className="data-note">가격 정보는 건강보험심사평가원이 공개한 비급여 진료비 자료를 바탕으로 합니다. 실제 진료비는 진료 내용에 따라 달라질 수 있어요.</p>
        </section>
      </main>
      <footer>
        <p>진료비 한눈에 · 건강보험심사평가원 공개자료 기반</p>
      </footer>
    </div>
  )
}
