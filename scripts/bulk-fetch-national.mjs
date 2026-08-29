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
  console.error('HIRA_API_KEY가 .env.local에 없어요.')
  process.exit(1)
}

const PRICE_URL = 'https://apis.data.go.kr/B551182/nonPaymentDamtInfoService/getNonPaymentItemHospList2'
const HOSP_URL = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList'
const PAGE_SIZE = 1000
const MAX_RETRIES = 5
const RETRY_DELAY_MS = 3000

const dataDir = path.join(ROOT, 'data')
const checkpointDir = path.join(dataDir, '_national-fetch')
const priceCheckpointDir = path.join(checkpointDir, 'price')
const hospCheckpointDir = path.join(checkpointDir, 'hosp')
fs.mkdirSync(priceCheckpointDir, { recursive: true })
fs.mkdirSync(hospCheckpointDir, { recursive: true })

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callApi(baseUrl, extraParams, retriesLeft = MAX_RETRIES) {
  const url = new URL(baseUrl)
  url.searchParams.set('serviceKey', API_KEY)
  url.searchParams.set('_type', 'json')
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, String(value))
  }
  const res = await fetch(url)
  const text = await res.text()

  let json = null
  let resultCode = null
  try {
    json = JSON.parse(text)
    resultCode = json?.response?.header?.resultCode ?? json?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode ?? null
  } catch {
  }
  const isSuccess = resultCode === '00' || resultCode === 0 || resultCode === '0'
  const isError = !res.ok || text.includes('SERVICETIMEOUT_ERROR') || json === null || !isSuccess

  if (isError) {
    if (retriesLeft > 0) {
      const reason = resultCode !== null ? `resultCode=${resultCode}` : `HTTP ${res.status}`
      console.log(`  (일시 오류(${reason}), ${retriesLeft}회 재시도 남음 — ${RETRY_DELAY_MS / 1000}초 후 재시도)`)
      await sleep(RETRY_DELAY_MS)
      return callApi(baseUrl, extraParams, retriesLeft - 1)
    }
    throw new Error(`${baseUrl} 호출 실패: ${res.status} ${text.slice(0, 300)}`)
  }

  const items = json?.response?.body?.items?.item
  const totalCount = json?.response?.body?.totalCount ?? null
  const arr = items ? (Array.isArray(items) ? items : [items]) : []
  return { items: arr, totalCount }
}

function checkpointPath(dir, page) {
  return path.join(dir, `page-${String(page).padStart(4, '0')}.json`)
}

function loadCheckpoint(dir, page) {
  const p = checkpointPath(dir, page)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function saveCheckpoint(dir, page, data) {
  fs.writeFileSync(checkpointPath(dir, page), JSON.stringify(data), 'utf-8')
}

function isCheckpointValid(cp) {
  return cp && Array.isArray(cp.items) && typeof cp.totalCount === 'number'
}

async function fetchAllPagesWithCheckpoint(url, label, checkpointDir) {
  const all = []
  let page = 1
  let totalCount = null
  const errorPages = []

  const firstCp = loadCheckpoint(checkpointDir, 1)
  if (firstCp && isCheckpointValid(firstCp)) {
    totalCount = firstCp.totalCount
  }

  while (true) {
    const cp = loadCheckpoint(checkpointDir, page)
    if (cp && isCheckpointValid(cp)) {
      all.push(...cp.items)
      if (totalCount === null) totalCount = cp.totalCount
      console.log(`  [${label}] ${page}페이지 체크포인트 사용, 누적 ${all.length}건 (totalCount=${totalCount})`)
      if (cp.items.length < PAGE_SIZE) break
      if (totalCount !== null && all.length >= totalCount) break
      page += 1
      continue
    }

    try {
      const { items, totalCount: tc } = await callApi(url, { numOfRows: PAGE_SIZE, pageNo: page })
      if (totalCount === null) totalCount = tc
      saveCheckpoint(checkpointDir, page, { items, totalCount: tc })
      all.push(...items)
      console.log(`  [${label}] ${page}페이지 수신, 누적 ${all.length}건 (totalCount=${totalCount})`)
      if (items.length < PAGE_SIZE) break
      if (totalCount !== null && all.length >= totalCount) break
      page += 1
      await sleep(500)
    } catch (err) {
      errorPages.push(page)
      console.log(`  [${label}] ${page}페이지 오류로 중단: ${err.message.slice(0, 150)}`)
      break
    }
  }

  return { all, totalCount, errorPages }
}

function mapKind(clCdNm) {
  if (!clCdNm) return '의원'
  if (clCdNm.includes('상급종합')) return '상급종합병원'
  if (clCdNm.includes('종합병원')) return '종합병원'
  if (clCdNm.includes('병원')) return '병원'
  return '의원'
}

function formatDate(raw) {
  if (!raw || String(raw).length !== 8) return ''
  const s = String(raw)
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`
}

function loadExistingProviders() {
  const outPath = path.join(dataDir, 'nonbenefit-prices.ts')
  if (!fs.existsSync(outPath)) return []
  const content = fs.readFileSync(outPath, 'utf-8')
  const eq = content.indexOf('providers: NonBenefitProvider[] = ')
  if (eq === -1) return []
  const jsonPart = content.slice(eq + 'providers: NonBenefitProvider[] = '.length).trim()
  try {
    return JSON.parse(jsonPart)
  } catch {
    console.log('  기존 data/nonbenefit-prices.ts 파싱 실패, 빈 배열로 취급')
    return []
  }
}

function saveProviders(providers) {
  fs.writeFileSync(path.join(dataDir, 'nonbenefit-prices.json'), JSON.stringify(providers), 'utf-8')
}

async function main() {
  console.log('[전국] 가격 요약 API 수집 시작 (지역 조건 없음)')
  const priceResult = await fetchAllPagesWithCheckpoint(PRICE_URL, '가격요약', priceCheckpointDir)

  console.log('\n[전국] 기관 메타데이터 API 수집 시작 (지역 조건 없음)')
  const hospResult = await fetchAllPagesWithCheckpoint(HOSP_URL, '기관메타', hospCheckpointDir)

  if (priceResult.all.length === 0) {
    console.error('\n가격 데이터를 하나도 못 받았어요 — 기존 데이터를 보존하고 중단합니다.')
    process.exit(1)
  }
  if (hospResult.all.length === 0) {
    console.error('\n기관 메타데이터를 하나도 못 받았어요 — 기존 데이터를 보존하고 중단합니다.')
    process.exit(1)
  }

  if (priceResult.errorPages.length > 0) {
    console.error('\n가격 API 오류 페이지 존재 — 기존 데이터를 보존하고 중단합니다.')
    console.error('오류 페이지:', priceResult.errorPages)
    process.exit(1)
  }
  if (hospResult.errorPages.length > 0) {
    console.error('\n기관 메타데이터 API 오류 페이지 존재 — 기존 데이터를 보존하고 중단합니다.')
    console.error('오류 페이지:', hospResult.errorPages)
    process.exit(1)
  }

  if (priceResult.totalCount !== null && priceResult.all.length < priceResult.totalCount) {
    console.error(`\n가격 데이터 미완료: totalCount=${priceResult.totalCount}, 받은 건수=${priceResult.all.length} — 기존 데이터를 보존하고 중단합니다.`)
    process.exit(1)
  }
  if (hospResult.totalCount !== null && hospResult.all.length < hospResult.totalCount) {
    console.error(`\n기관 메타데이터 미완료: totalCount=${hospResult.totalCount}, 받은 건수=${hospResult.all.length} — 기존 데이터를 보존하고 중단합니다.`)
    process.exit(1)
  }

  const hospByYkiho = new Map()
  let hospDupCount = 0
  for (const h of hospResult.all) {
    if (hospByYkiho.has(h.ykiho)) hospDupCount += 1
    hospByYkiho.set(h.ykiho, h)
  }

  const newRecords = []
  const unmatchedYkiho = new Set()
  for (const price of priceResult.all) {
    const hosp = hospByYkiho.get(price.ykiho)
    if (!hosp) {
      unmatchedYkiho.add(price.ykiho)
      continue
    }
    newRecords.push({
      ykiho: price.ykiho,
      name: price.yadmNm,
      kind: mapKind(price.clCdNm),
      item: price.npayKorNm,
      district: price.sgguCdNm,
      neighborhood: hosp.emdongNm?.trim() || undefined,
      address: hosp.addr,
      lat: Number(hosp.YPos),
      lng: Number(hosp.XPos),
      priceMin: Number(price.minPrc),
      priceMax: Number(price.maxPrc),
      updated: formatDate(price.adtFrDd),
      hospUrl: hosp.hospUrl?.trim() || undefined,
    })
  }

  if (unmatchedYkiho.size > 0) {
    console.error('\n기관 메타데이터 조인 누락 발생 — data/nonbenefit-prices.ts를 쓰지 않고 종료합니다.')
    console.error('누락 ykiho 수:', unmatchedYkiho.size)
    console.error('누락 ykiho 샘플(최대 10개):', [...unmatchedYkiho].slice(0, 10))
    process.exit(1)
  }

  saveProviders(newRecords)

  console.log('\n=== 완료 보고 ===')
  console.log('가격 API totalCount:', priceResult.totalCount, '/ 실제 받은 개수:', priceResult.all.length, '/ 페이지 수:', Math.ceil((priceResult.totalCount ?? priceResult.all.length) / PAGE_SIZE), '/ 오류 페이지:', priceResult.errorPages)
  console.log('기관 메타 API totalCount:', hospResult.totalCount, '/ 실제 받은 개수:', hospResult.all.length, '/ 페이지 수:', Math.ceil((hospResult.totalCount ?? hospResult.all.length) / PAGE_SIZE), '/ 오류 페이지:', hospResult.errorPages)
  console.log('기관 목록 자체의 ykiho 중복 수:', hospDupCount)
  console.log('기관 메타데이터 조인 누락 수:', unmatchedYkiho.size)
  console.log('최종 레코드 수:', newRecords.length)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
