import { useEffect, useMemo, useState } from 'react'
import './index.css'
import type { SearchResult } from '../lib/types'

type Sort = 'price' | 'distance'

const items = [
  { official: '인플루엔자 예방접종료', aliases: ['독감주사', '독감 예방접종', '독감백신'] },
  { official: '알레르기 검사료', aliases: ['알러지검사', '알레르기 검사', '알러지'] },
  { official: '도수치료', aliases: ['도수치료', '물리치료'] },
]

const formatPrice = (price: number) => (price === 0 ? '무료' : `${price.toLocaleString()}원`)

export default function App() {
  const [query, setQuery] = useState('독감주사')
  const [selected, setSelected] = useState(items[0])
  const [city, setCity] = useState('서울특별시')
  const [district, setDistrict] = useState('강남구')
  const [neighborhood, setNeighborhood] = useState('역삼동')
  const [sort, setSort] = useState<Sort>('price')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState('직접 선택한 지역 사용 중')
  const [notice, setNotice] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const matchedItems = useMemo(() => {
    const normalized = query.replaceAll(' ', '').toLowerCase()
    return items.filter((item) =>
      [item.official, ...item.aliases].some(
        (word) =>
          word.replaceAll(' ', '').toLowerCase().includes(normalized) ||
          normalized.includes(word.replaceAll(' ', '').toLowerCase()),
      ),
    )
  }, [query])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ district, sort })
    if (coords) {
      params.set('lat', String(coords.lat))
      params.set('lng', String(coords.lng))
    }
    fetch(`/api/search?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setResults(data.results ?? [])
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
  }, [district, sort, coords])

  const search = () => {
    if (!query.trim()) {
      setNotice('찾고 싶은 진료 항목을 입력해 주세요.')
      return
    }
    if (matchedItems.length) {
      setSelected(matchedItems[0])
      setNotice(`"${matchedItems[0].official}" 항목으로 비교 결과를 보여드려요.`)
    } else {
      setNotice('정확한 항목을 찾지 못했어요. 아래 추천 항목에서 선택해 주세요.')
    }
  }

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('위치 기능을 지원하지 않는 환경')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationStatus('현재 위치를 반영했어요')
      },
      () => {
        setCoords(null)
        setLocationStatus('위치 권한이 없어 선택한 지역 기준으로 표시 중')
      },
    )
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
                <strong>{selected.official}</strong>
              </div>
            </div>
          </section>
          <section className="location-card" aria-label="위치 및 지역 설정">
            <div className="location-heading">
              <p className="section-label">검색 지역</p>
              <button className="outline-button" onClick={requestLocation}>내 위치 사용</button>
            </div>
            <div className="region-selects" aria-label="지역 선택">
              <label className="district-select">
                시·도
                <select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option>서울특별시</option>
                  <option>경기도</option>
                  <option>인천광역시</option>
                </select>
              </label>
              <label className="district-select">
                시·군·구
                <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                  <option>강남구</option>
                  <option>서초구</option>
                  <option>송파구</option>
                </select>
              </label>
              <label className="district-select">
                동
                <select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}>
                  <option>역삼동</option>
                  <option>논현동</option>
                  <option>삼성동</option>
                  <option>대치동</option>
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
              <h2>{selected.official} <span>비교 결과</span></h2>
            </div>
            <div className="sort-tabs" role="group" aria-label="정렬 기준">
              <button className={sort === 'price' ? 'active' : ''} onClick={() => setSort('price')}>낮은 가격순</button>
              <button className={sort === 'distance' ? 'active' : ''} disabled={!coords} onClick={() => setSort('distance')}>
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
            {!loading && results.length === 0 && (
              <p className="notice">아직 {district} 지역의 실제 데이터가 없어요. 강남구로 검색해 보세요.</p>
            )}
            {results.map((provider, index) => (
              <article className={`provider-card ${provider.kind === '보건소' ? 'public' : ''}`} key={provider.ykiho}>
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
