# 진료비 한눈에 — Day 2 실동작 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배포된 URL(`healthcost-eight.vercel.app`)에서 "독감주사"를 검색하면, 실제 건강보험심사평가원(HIRA) 공공데이터 API로 받아온 강남구 병원들의 진짜 비급여 가격이 가격순/거리순으로 비교되어 끝까지 동작하게 만든다.

**Architecture:** healthcost(현재 vanilla HTML + Node 스텁 서버)를 "진료비 한눈에" 목업의 React+Vite 구조로 전환한다. 백엔드는 별도 서버나 DB 없이 Vercel 서버리스 함수(`api/search.ts`) 하나가 미리 받아둔 실데이터 JSON(`data/nonbenefit-prices.json`)을 읽어 시군구로 필터링하고, 브라우저 GPS 좌표가 있으면 haversine 거리를 계산해 정렬한다. 실데이터는 오늘 한 번 `scripts/fetch-hira-data.mjs`로 실제 HIRA API를 호출해 만든다. 이 구조는 나중에 Supabase로 갈아탈 때 `api/search.ts` 내부 구현만 바꾸면 되도록 설계한다 (프론트는 안 건드림).

**Tech Stack:** React 18 + Vite 5 + TypeScript, Vercel 서버리스 함수(Node), Vitest(순수 로직 단위 테스트). DB 없음, 로그인 없음, 지도 SDK 없음.

**Spec:** `C:\Users\USER\Desktop\0823 작업\비급여진료비탐색서비스_PRD.md` (전체 로드맵), `C:\Users\USER\Desktop\healthcost\CLAUDE.md` (이 저장소의 확정 원칙 — Task 7에서 1번 항목만 갱신), UI 원본: `C:\Users\USER\Desktop\진료비 한눈에\src\App.tsx`

## Global Constraints

- 오늘 스코프: 항목 1개(인플루엔자 예방접종료="독감주사") × 시군구 1개(강남구)만 실데이터로 동작. 다른 항목/구는 UI에 남겨두되 "데이터 없음" 처리.
- DB 없음, 로그인 없음, 지도 SDK 없음 (PRD §5, healthcost/CLAUDE.md #2).
- 실시간 API 직접 호출 금지 — 배치로 한 번 받아 정적 JSON으로 저장 후 서빙 (healthcost/CLAUDE.md #3).
- 실제 데이터만 사용. 좌표·주소·가격을 임의로 지어내지 않는다 — 확인 안 되는 값은 비워두거나 스코프에서 뺀다.
- `.env.local`은 git에 커밋하지 않는다 (`.gitignore`에 이미 `.env*` 포함되어 있음, 확인 완료).
- 보건소 데이터는 오늘 스코프 아님 (좌표 미검증) — 다음 작업으로 미룸.

---

## Task 1: healthcost를 React+Vite로 전환 (데이터는 아직 기존 하드코딩 유지)

목업 UI를 healthcost에 그대로 이식해서 "포팅 자체가 성공했는지"부터 먼저 확인한다. 데이터 연동은 다음 태스크에서 별도로 검증한다.

**Files:**
- Delete: `server.js`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx` (원본 그대로, 뒤 태스크에서 수정)
- Create: `src/index.css` (목업에서 복사)

**Interfaces:**
- Produces: `npm run dev`로 로컬에서 뜨는 React 앱 (Task 6에서 이 `src/App.tsx`를 수정)

- [ ] **Step 1: 스텁 서버 제거**

```bash
cd "C:/Users/USER/Desktop/healthcost"
rm server.js
```

- [ ] **Step 2: package.json 교체**

```json
{
  "name": "healthcost",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "fetch:data": "node scripts/fetch-hira-data.mjs"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vercel/node": "^3.2.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 3: vite.config.ts 교체** (기존 `localhost:8000` 프록시는 잔재이므로 제거)

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 4: index.html 교체**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>진료비 한눈에</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: src 디렉터리 만들고 main.tsx 작성**

```bash
mkdir -p src
```

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 6: 목업의 App.tsx / index.css를 그대로 복사** (아직 하드코딩 데이터 유지 — 다음 태스크에서 실데이터로 교체)

```bash
cp "C:/Users/USER/Desktop/진료비 한눈에/src/App.tsx" src/App.tsx
cp "C:/Users/USER/Desktop/진료비 한눈에/src/index.css" src/index.css
```

- [ ] **Step 7: 설치 및 로컬 확인**

```bash
npm install
npm run dev
```

Expected: 터미널에 `http://localhost:5173` 같은 주소가 뜨고, 브라우저로 열면 목업과 동일한 "진료비 한눈에" 화면(검색창, 지역 선택, 강남구 하드코딩 결과 5건)이 보인다.

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "chore: convert healthcost to Vite+React, port UI mockup"
```

---

## Task 2: 거리 계산 순수 함수 (haversine) — TDD

**Files:**
- Create: `lib/geo.ts`
- Test: `lib/geo.test.ts`

**Interfaces:**
- Produces: `haversineKm(lat1, lng1, lat2, lng2): number` — Task 3(`search.ts`)과 Task 5(`api/search.ts`)에서 사용

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/geo.test.ts
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
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
npx vitest run lib/geo.test.ts
```

Expected: FAIL (`lib/geo.ts` 파일이 없어서 import 에러)

- [ ] **Step 3: 최소 구현**

```ts
// lib/geo.ts
const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run lib/geo.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/geo.ts lib/geo.test.ts
git commit -m "feat: add haversine distance calculation"
```

---

## Task 3: 검색/필터/정렬 순수 함수 — TDD

**Files:**
- Create: `lib/types.ts`
- Create: `lib/search.ts`
- Test: `lib/search.test.ts`

**Interfaces:**
- Consumes: `haversineKm` from `lib/geo.ts` (Task 2)
- Produces: `NonBenefitProvider`, `SearchResult` 타입과 `searchProviders(providers, params): SearchResult[]` — Task 5(`api/search.ts`)에서 사용

- [ ] **Step 1: 타입 정의**

```ts
// lib/types.ts
export type ProviderKind = '보건소' | '의원' | '병원' | '종합병원' | '상급종합병원'

export type NonBenefitProvider = {
  ykiho: string
  name: string
  kind: ProviderKind
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
```

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// lib/search.test.ts
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
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

```bash
npx vitest run lib/search.test.ts
```

Expected: FAIL (`lib/search.ts` 없음)

- [ ] **Step 4: 최소 구현**

```ts
// lib/search.ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run lib/search.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 6: 커밋**

```bash
git add lib/types.ts lib/search.ts lib/search.test.ts
git commit -m "feat: add provider search/filter/sort logic"
```

---

## Task 4: 실제 HIRA API로 강남구 독감주사 데이터 수집

여기서부터 실제 공공데이터포털 API를 호출한다. 정확한 응답 필드명은 문서만으로 100% 확정할 수 없으니(Swagger가 JS 렌더링이라 자동 확인 불가), **1페이지 응답을 그대로 파일로 덤프해서 눈으로 확인하는 단계를 포함**한다 — 필드명이 다르면 이 덤프를 보고 스크립트의 필드명만 고치면 된다.

**Files:**
- Create: `scripts/fetch-hira-data.mjs`
- Create (실행 결과물): `data/nonbenefit-prices.json`
- Modify: `.env.local` (키 이름만 추가, 값은 비워둠)

**Interfaces:**
- Produces: `data/nonbenefit-prices.json` — `NonBenefitProvider[]` 배열 (Task 5에서 `api/search.ts`가 읽음)

- [ ] **Step 1: `.env.local`에 키 자리 추가** (값은 본인이 채워넣기)

```bash
echo "HIRA_API_KEY=" >> .env.local
```

Expected: `.env.local`에 `HIRA_API_KEY=여기에_본인_인증키` 형태로 값을 채워넣는다. (이 파일은 `.gitignore`에 이미 포함되어 git에 올라가지 않는다 — Task 시작 전에 `git check-ignore .env.local`로 한 번 더 확인)

- [ ] **Step 2: 수집 스크립트 작성**

```js
// scripts/fetch-hira-data.mjs
// 실행: npm run fetch:data
// .env.local의 HIRA_API_KEY로 실제 HIRA API를 호출해
// 강남구 병원의 "인플루엔자 예방접종료" 비급여 가격을 data/nonbenefit-prices.json으로 저장한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key && value && !process.env[key]) process.env[key] = value
  }
}
loadEnvLocal()

const API_KEY = process.env.HIRA_API_KEY
if (!API_KEY) {
  console.error('HIRA_API_KEY가 .env.local에 없어요. 값을 채운 뒤 다시 실행하세요.')
  process.exit(1)
}

const HOSP_URL = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList'
const NONPAY_URL = 'https://apis.data.go.kr/B551182/nonPaymentDamtInfoService/getNonPaymentItemHospDtlList'
const TARGET_DISTRICT = '강남구'
const TARGET_ITEM_KEYWORDS = ['인플루엔자', '독감']
const MAX_HOSPITALS = 8
const MAX_PAGES = 30
const PAGE_SIZE = 1000

const debugDir = path.join(ROOT, 'data')
fs.mkdirSync(debugDir, { recursive: true })

async function callApi(baseUrl, extraParams) {
  const url = new URL(baseUrl)
  url.searchParams.set('serviceKey', API_KEY)
  url.searchParams.set('_type', 'json')
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, String(value))
  }
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${baseUrl} 호출 실패: ${res.status} ${text}`)
  }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`JSON 파싱 실패 — 응답이 XML/에러 메시지일 수 있어요. 원문:\n${text.slice(0, 1000)}`)
  }
  const items = json?.response?.body?.items?.item
  if (!items) return []
  return Array.isArray(items) ? items : [items]
}

async function findGangnamHospitals() {
  const found = []
  for (let page = 1; page <= MAX_PAGES && found.length < MAX_HOSPITALS; page += 1) {
    const items = await callApi(HOSP_URL, { numOfRows: PAGE_SIZE, pageNo: page })
    if (page === 1) {
      fs.writeFileSync(path.join(debugDir, '_debug-hosp-page1.json'), JSON.stringify(items.slice(0, 2), null, 2))
    }
    if (items.length === 0) break
    for (const item of items) {
      if (typeof item.addr === 'string' && item.addr.includes(TARGET_DISTRICT)) {
        found.push(item)
        if (found.length >= MAX_HOSPITALS) break
      }
    }
    console.log(`  ${page}페이지 확인, 누적 ${TARGET_DISTRICT} 매칭 ${found.length}건`)
  }
  return found
}

async function findNonPaymentItem(ykiho, isFirst) {
  const items = await callApi(NONPAY_URL, { ykiho, numOfRows: 100, pageNo: 1 })
  if (isFirst) {
    fs.writeFileSync(path.join(debugDir, '_debug-nonpay-sample.json'), JSON.stringify(items, null, 2))
  }
  return items.find(
    (item) =>
      typeof item.npayKorNm === 'string' &&
      TARGET_ITEM_KEYWORDS.some((keyword) => item.npayKorNm.includes(keyword)),
  )
}

function formatDate(raw) {
  if (!raw || String(raw).length !== 8) return ''
  const s = String(raw)
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`
}

function mapKind(clCdNm) {
  if (!clCdNm) return '의원'
  if (clCdNm.includes('상급종합')) return '상급종합병원'
  if (clCdNm.includes('종합병원')) return '종합병원'
  if (clCdNm.includes('병원')) return '병원'
  return '의원'
}

async function main() {
  console.log(`1) ${TARGET_DISTRICT} 소재 병원 목록 조회 중...`)
  const hospitals = await findGangnamHospitals()
  console.log(`   ${hospitals.length}개 병원 확보`)
  if (hospitals.length === 0) {
    console.error('강남구 병원을 하나도 못 찾았어요. data/_debug-hosp-page1.json 을 열어 addr 필드명이 맞는지 확인하세요.')
    process.exit(1)
  }

  console.log('2) 병원별 인플루엔자 예방접종료 비급여 가격 조회 중...')
  const providers = []
  let first = true
  for (const hosp of hospitals) {
    const nonpay = await findNonPaymentItem(hosp.ykiho, first)
    first = false
    if (!nonpay) {
      console.log(`   - ${hosp.yadmNm}: 해당 항목 가격 정보 없음, 건너뜀`)
      continue
    }
    providers.push({
      ykiho: hosp.ykiho,
      name: hosp.yadmNm,
      kind: mapKind(hosp.clCdNm),
      district: TARGET_DISTRICT,
      address: hosp.addr,
      lat: Number(hosp.YPos),
      lng: Number(hosp.XPos),
      priceMin: Number(nonpay.curAmt ?? nonpay.minAmt ?? 0),
      priceMax: Number(nonpay.curAmt ?? nonpay.maxAmt ?? nonpay.minAmt ?? 0),
      updated: formatDate(nonpay.adtFrDd),
    })
    console.log(`   - ${hosp.yadmNm}: ${nonpay.curAmt ?? nonpay.minAmt}원 확보`)
  }

  if (providers.length === 0) {
    console.error('조회된 가격 데이터가 없어요. data/_debug-nonpay-sample.json 을 열어 npayKorNm/curAmt 필드명이 맞는지 확인하세요.')
    process.exit(1)
  }

  const outPath = path.join(ROOT, 'data', 'nonbenefit-prices.json')
  fs.writeFileSync(outPath, JSON.stringify(providers, null, 2), 'utf-8')
  console.log(`3) 완료: ${providers.length}건 저장 → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 3: 실행**

```bash
npm run fetch:data
```

Expected: 콘솔에 병원 이름과 가격이 몇 건 출력되고, `data/nonbenefit-prices.json`이 생성된다.

**만약 0건이면:** `data/_debug-hosp-page1.json`, `data/_debug-nonpay-sample.json`을 열어서 실제 필드명을 확인하고, 스크립트의 `item.addr` / `nonpay.npayKorNm` / `nonpay.curAmt` / `hosp.YPos` / `hosp.XPos` 같은 필드명을 실제 응답에 맞게 고친 뒤 다시 실행한다. (이건 placeholder가 아니라 외부 API 연동에서 항상 필요한 정상적인 확인 절차예요.)

- [ ] **Step 4: 결과 확인**

```bash
cat data/nonbenefit-prices.json
```

Expected: `district`가 전부 "강남구"이고, `priceMin`/`priceMax`가 실제 숫자(0원 아님)로 채워진 배열이 최소 1건 이상 보인다.

- [ ] **Step 5: 커밋** (디버그 덤프 파일은 제외)

```bash
rm -f data/_debug-hosp-page1.json data/_debug-nonpay-sample.json
git add scripts/fetch-hira-data.mjs data/nonbenefit-prices.json .env.local
git commit -m "feat: fetch real HIRA data for Gangnam-gu flu vaccination pricing"
```

---

## Task 5: `/api/search` Vercel 서버리스 함수

**Files:**
- Create: `api/search.ts`

**Interfaces:**
- Consumes: `searchProviders` from `lib/search.ts` (Task 3), `data/nonbenefit-prices.json` (Task 4)
- Produces: `GET /api/search?district=강남구&sort=price&lat=..&lng=..` → `{ results: SearchResult[] }`

- [ ] **Step 1: 함수 작성**

```ts
// api/search.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import providers from '../data/nonbenefit-prices.json'
import { searchProviders } from '../lib/search'
import type { NonBenefitProvider } from '../lib/types'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const district = typeof req.query.district === 'string' ? req.query.district : undefined
  const lat = req.query.lat ? Number(req.query.lat) : undefined
  const lng = req.query.lng ? Number(req.query.lng) : undefined
  const sort = req.query.sort === 'distance' ? 'distance' : 'price'

  const results = searchProviders(providers as NonBenefitProvider[], { district, lat, lng, sort })
  res.status(200).json({ results })
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음 (실제 요청/응답 테스트는 Task 8의 배포 후 E2E 확인에서 한다 — Vercel 서버리스 함수는 로컬 `vite dev`로는 안 뜨고 `vercel dev`나 실제 배포가 필요하기 때문)

- [ ] **Step 3: 커밋**

```bash
git add api/search.ts
git commit -m "feat: add /api/search serverless function"
```

---

## Task 6: 프론트를 실제 API 연동으로 교체

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/search` (Task 5), `SearchResult` type from `lib/types.ts` (Task 3)

- [ ] **Step 1: App.tsx를 실 데이터 연동 버전으로 교체**

```tsx
// src/App.tsx
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
```

- [ ] **Step 2: 로컬에서 프론트만 확인** (API는 로컬에서 안 뜨므로 `/api/search`는 404가 나는 게 정상 — "불러오지 못했어요" 알림이 뜨는지만 확인)

```bash
npm run dev
```

Expected: 화면은 뜨고, 콘솔에 `/api/search` 404 에러가 보인다. (Task 8에서 배포 후 실제로 확인)

- [ ] **Step 3: 커밋**

```bash
git add src/App.tsx
git commit -m "feat: wire frontend to real /api/search endpoint"
```

---

## Task 7: 문서/환경 정리

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:** 없음 (문서만)

- [ ] **Step 1: CLAUDE.md 1번 항목만 갱신** (오늘 Vercel 서버리스 함수를 실제로 도입했으므로)

```markdown
# CLAUDE.md — 비급여진료비탐색서비스

PRD(`비급여진료비탐색서비스_PRD.md`)의 암묵지 세 개를 그대로 옮김.

1. 기술 스택: React+Vite 프론트 + Vercel 서버리스 함수(`api/`) + 정적 JSON 데이터(`data/`) — 로그인, 전통적 백엔드 서버, DB 없음
2. 지도 SDK는 1차에서 제외, "거리순 정렬된 리스트"로 대체 (화면 복잡도·API 키 발급 등 리스크 최소화)
3. 실시간 API 호출 (승인 트래픽 제한·응답 지연 리스크로 사전 캐싱된 정적 데이터로 대체)
```

- [ ] **Step 2: README.md 갱신**

```markdown
https://healthcost-eight.vercel.app

# 비급여진료비탐색서비스

`npm install` 후 `npm run dev`로 로컬에서 프론트 확인 (API는 배포 환경에서만 동작).
데이터 갱신: `.env.local`에 `HIRA_API_KEY` 채운 뒤 `npm run fetch:data`.
git push 시 Vercel에 자동 배포.
```

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update stack notes and dev instructions"
```

---

## Task 8: 배포 및 실제 URL E2E 확인

**Files:** 없음 (배포/검증만)

- [ ] **Step 1: 원격 push**

```bash
git push origin main
```

- [ ] **Step 2: Vercel 배포 완료 대기 후 라이브 URL 접속**

`https://healthcost-eight.vercel.app` 를 브라우저로 열고 확인.

- [ ] **Step 3: 실제 E2E 시나리오 확인**

1. 검색창에 "독감주사" 입력 → 검색 → "인플루엔자 예방접종료" 매칭 안내 뜨는지
2. 지역이 강남구인 상태에서 아래 결과 리스트에 Task 4에서 받은 실제 병원/가격이 뜨는지 (하드코딩 5건이 아니라 실제 수집된 건수와 일치하는지)
3. "낮은 가격순" ↔ 정렬 시 순서가 실제로 바뀌는지
4. "내 위치 사용" 클릭 → 브라우저 권한 허용 → "가까운 거리순" 버튼이 활성화되고 거리(km)가 표시되는지
5. 서초구/송파구로 지역 변경 → "아직 데이터가 없어요" 안내가 뜨는지 (에러로 깨지지 않는지)

Expected: 1~5 모두 통과하면 오늘의 성공 기준("배포된 URL에서 핵심 기능 하나가 처음부터 끝까지 동작") 달성.

- [ ] **Step 4: 문제 발견 시** — 브라우저 개발자도구 Network 탭에서 `/api/search` 응답을 확인해 400/500이면 Vercel 대시보드의 Function 로그를 확인 (플레이스홀더 없이 여기서 바로 디버깅)
