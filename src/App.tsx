import { useMemo, useState } from 'react'
import './index.css'
type Sort = 'price' | 'distance'
type Provider = {
  id: number
  name: string
  kind: '보건소' | '의원' | '병원'
  district: string
  distance: number
  price: number
  range?: string
  updated: string
  benefit?: string
}
const items = [
  { official: '인플루엔자 예방접종료', aliases: ['독감주사', '독감 예방접종', '독감백신'] },
  { official: '알레르기 검사료', aliases: ['알러지검사', '알레르기 검사', '알러지'] },
  { official: '도수치료', aliases: ['도수치료', '물리치료'] },
]
const providers: Provider[] = [
  { id: 1, name: '강남구보건소', kind: '보건소', district: '강남구', distance: 0.8, price: 0, updated: '2026.08.12', benefit: '만 65세 이상 무료 대상 확인' },
  { id: 2, name: '삼성튼튼의원', kind: '의원', district: '강남구', distance: 0.6, price: 28000, updated: '2026.07.29' },
  { id: 3, name: '역삼서울내과', kind: '의원', district: '강남구', distance: 1.2, price: 30000, updated: '2026.08.02' },
  { id: 4, name: '강남메디컬센터', kind: '병원', district: '강남구', distance: 1.8, price: 35000, range: '30,000 ~ 40,000원', updated: '2026.07.18' },
  { id: 5, name: '논현가정의학과', kind: '의원', district: '강남구', distance: 2.1, price: 32000, updated: '2026.08.05' },
]
const formatPrice = (price: number) => price === 0 ? '무료' : `${price.toLocaleString()}원`
export default function App() {
  const [query, setQuery] = useState('독감주사')
  const [selected, setSelected] = useState(items[0])
  const [city, setCity] = useState('서울특별시')
  const [district, setDistrict] = useState('강남구')
  const [neighborhood, setNeighborhood] = useState('역삼동')
  const [sort, setSort] = useState<Sort>('price')
  const [locationStatus, setLocationStatus] = useState('현재 위치 사용')
  const [notice, setNotice] = useState('')
  const matchedItems = useMemo(() => {
    const normalized = query.replaceAll(' ', '').toLowerCase()
    return items.filter((item) => [item.official, ...item.aliases].some((word) => word.replaceAll(' ', '').toLowerCase().includes(normalized) || normalized.includes(word.replaceAll(' ', '').toLowerCase())))
  }, [query])
  const results = useMemo(() => [...providers].sort((a, b) => sort === 'price' ? a.price - b.price || a.distance - b.distance : a.distance - b.distance), [sort])
  const search = () => {
    if (!query.trim()) {
      setNotice('찾고 싶은 진료 항목을 입력해 주세요.')
      return
    }
    if (matchedItems.length) {
      setSelected(matchedItems[0])
      setNotice(`“${matchedItems[0].official}” 항목으로 비교 결과를 보여드려요.`)
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
      () => setLocationStatus('현재 위치를 반영했어요'),
      () => setLocationStatus('위치 권한이 없어 강남구 기준으로 표시 중'),
    )
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="진료비 한눈에 홈"><span className="brand-mark">+</span><strong>진료비 한눈에</strong></a>
        <nav aria-label="주요 메뉴"><a href="#search">진료비 비교</a><a href="#guide">이용 안내</a></nav>
      </header>
      <main id="top" className="split-layout">
        <aside className="search-sidebar" id="search">
          <div className="sidebar-intro">
            <div className="clay-orbit compact" aria-hidden="true">
              <span className="clay-spark spark-one">✦</span>
              <span className="clay-spark spark-two">+</span>
              <div className="clay-coin">₩</div>
              <div className="clay-cross">+</div>
              <div className="clay-pill"></div>
            </div>
            <h1>가까운 곳의<br /><em>진료비를 한눈에</em><br />비교하세요.</h1>
          </div>
          <section className="search-card" aria-label="진료 항목 검색">
            <p className="section-label">진료 항목 찾기</p>
            <label className="search-input"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="예: 독감주사, 알러지검사" aria-label="진료 항목 검색" /><button onClick={search}>검색</button></label>
            <p className="search-help">“독감주사”처럼 편하게 입력해 보세요.</p>
            <div className="matched-item">
              <div className="match-icon" aria-hidden="true">✓</div>
              <div><small>가장 가까운 공식 항목</small><strong>{selected.official}</strong></div>
            </div>
          </section>
          <section className="location-card" aria-label="위치 및 지역 설정">
            <div className="location-heading">
              <p className="section-label">검색 지역</p>
              <button className="outline-button" onClick={requestLocation}>내 위치 사용</button>
            </div>
            <div className="region-selects" aria-label="지역 선택">
              <label className="district-select">시·도<select value={city} onChange={(e) => setCity(e.target.value)}><option>서울특별시</option><option>경기도</option><option>인천광역시</option></select></label>
              <label className="district-select">시·군·구<select value={district} onChange={(e) => setDistrict(e.target.value)}><option>강남구</option><option>서초구</option><option>송파구</option></select></label>
              <label className="district-select">동<select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}><option>역삼동</option><option>논현동</option><option>삼성동</option><option>대치동</option></select></label>
            </div>
            <div className="location-block"><span className="pin" aria-hidden="true">●</span><div><b>{city} {district} {neighborhood}</b><small>{locationStatus.includes('현재') ? '현재 위치 사용 중' : '지정 위치 사용 중'} · {locationStatus}</small></div></div>
          </section>
          {notice && <p className="notice" role="status">{notice}</p>}
        </aside>
        <section className="results-panel" aria-live="polite">
          <div className="results-topline">
            <div><p className="section-label">{district} 기준</p><h2>{selected.official} <span>비교 결과</span></h2></div>
            <div className="sort-tabs" role="group" aria-label="정렬 기준"><button className={sort === 'price' ? 'active' : ''} onClick={() => setSort('price')}>낮은 가격순</button><button className={sort === 'distance' ? 'active' : ''} onClick={() => setSort('distance')}>가까운 거리순</button></div>
          </div>
          <div className="summary-strip"><div><span>가장 낮은 가격</span><strong className="free">무료</strong><small>강남구보건소</small></div><div><span>일반 의료기관 평균</span><strong>31,400원</strong><small>현재 비교 결과 기준</small></div><div><span>가격 차이</span><strong>최대 35,000원</strong><small>공개된 최저가 기준</small></div></div>
          <div className="result-list">
            {results.map((provider, index) => <article className={`provider-card ${provider.kind === '보건소' ? 'public' : ''}`} key={provider.id}>
              <div className="rank">{index + 1}</div>
              <div className="provider-main"><div className="provider-title"><span className={`kind ${provider.kind}`}>{provider.kind}</span><h3>{provider.name}</h3>{provider.kind === '보건소' && <span className="recommend">저비용 대안</span>}</div><p>{provider.district} · 현재 위치에서 약 {provider.distance}km</p>{provider.benefit && <p className="benefit">ⓘ {provider.benefit}</p>}</div>
              <div className="price-box"><strong className={provider.price === 0 ? 'free' : ''}>{formatPrice(provider.price)}</strong>{provider.range && <small>{provider.range}</small>}<small>정보 갱신 {provider.updated}</small></div>
              <button className="detail-button" onClick={() => setNotice(`${provider.name}의 상세 정보는 데이터 연동 후 제공됩니다.`)}>상세 보기</button>
            </article>)}
          </div>
          <p className="data-note">가격 정보는 의료기관이 공개한 비급여 진료비 자료를 바탕으로 합니다. 실제 진료비는 진료 내용에 따라 달라질 수 있어요.</p>
        </section>
      </main>
      <footer>
        <p>진료비 한눈에 · 심사평가원 공개자료 및 보건소 공개정보 기반</p>
        <section className="guide" id="guide"><p className="section-label">이렇게 이용하세요</p><h2>복잡한 의료비 정보, 담백하게.</h2><div className="guide-grid"><div><b>01</b><h3>편하게 검색</h3><p>일상적인 표현으로 필요한 진료를 찾아요.</p></div><div><b>02</b><h3>가까운 곳 비교</h3><p>지역과 거리를 기준으로 결과를 좁혀요.</p></div><div><b>03</b><h3>합리적으로 선택</h3><p>병원뿐 아니라 보건소 대안도 확인해요.</p></div></div></section>
      </footer>
    </div>
  )
}
