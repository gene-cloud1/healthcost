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
// CLI 인자로 구를 넘기면 그 구들만, 안 넘기면 강남구만 (기존 동작 유지).
// --all 을 같이 넘기면 구당 병원 수 캡을 없앤다 (기본은 8곳 캡).
// 예: node scripts/fetch-hira-data.mjs --all 강남구 서초구 성남시
const rawArgs = process.argv.slice(2)
const FETCH_ALL = rawArgs.includes('--all')
const TARGET_DISTRICTS = rawArgs.filter((a) => a !== '--all').length > 0
  ? rawArgs.filter((a) => a !== '--all')
  : ['강남구']
const MAX_HOSPITALS = FETCH_ALL ? Infinity : 8
const MAX_PAGES = 30
const PAGE_SIZE = 1000

const debugDir = path.join(ROOT, 'data')
fs.mkdirSync(debugDir, { recursive: true })

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callApi(baseUrl, extraParams, retriesLeft = 5) {
  const url = new URL(baseUrl)
  url.searchParams.set('serviceKey', API_KEY)
  url.searchParams.set('_type', 'json')
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, String(value))
  }
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok || text.includes('SERVICETIMEOUT_ERROR')) {
    if (retriesLeft > 0) {
      console.log(`  (일시 오류, ${retriesLeft}회 재시도 남음 — 3초 후 재시도)`)
      await sleep(3000)
      return callApi(baseUrl, extraParams, retriesLeft - 1)
    }
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

async function findHospitalsInDistrict(district) {
  const found = []
  for (let page = 1; page <= MAX_PAGES && found.length < MAX_HOSPITALS; page += 1) {
    const items = await callApi(HOSP_URL, { numOfRows: PAGE_SIZE, pageNo: page })
    if (page === 1) {
      fs.writeFileSync(path.join(debugDir, '_debug-hosp-page1.json'), JSON.stringify(items.slice(0, 2), null, 2))
    }
    if (items.length === 0) break
    for (const item of items) {
      if (typeof item.addr === 'string' && item.addr.includes(district)) {
        found.push(item)
        if (found.length >= MAX_HOSPITALS) break
      }
    }
    console.log(`  ${page}페이지 확인, 누적 ${district} 매칭 ${found.length}건`)
  }
  return found
}

async function findNonPaymentItems(ykiho, isFirst) {
  const items = await callApi(NONPAY_URL, { ykiho, numOfRows: 100, pageNo: 1 })
  if (isFirst) {
    fs.writeFileSync(path.join(debugDir, '_debug-nonpay-sample.json'), JSON.stringify(items, null, 2))
  }
  return items.filter((item) => typeof item.npayKorNm === 'string' && item.npayKorNm.trim())
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

// 기존 data/nonbenefit-prices.ts에서 providers 배열만 뽑아온다.
// `export const providers: NonBenefitProvider[] = [ ... ]` 형태라
// '=' 뒤부터 끝까지가 유효한 JSON 배열이라는 점을 이용한다.
function loadExistingProviders() {
  const outPath = path.join(ROOT, 'data', 'nonbenefit-prices.ts')
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

async function fetchDistrict(district) {
  console.log(`\n[${district}] 소재 병원 목록 조회 중...`)
  const hospitals = await findHospitalsInDistrict(district)
  console.log(`   ${hospitals.length}개 병원 확보`)
  if (hospitals.length === 0) {
    console.log(`   [${district}] 병원을 하나도 못 찾았어요, 건너뜀`)
    return []
  }

  console.log(`[${district}] 병원별 신고 비급여 항목 전체 조회 중...`)
  const providers = []
  let first = true
  for (const hosp of hospitals) {
    if (!first) await sleep(1000)
    let nonpayItems
    try {
      nonpayItems = await findNonPaymentItems(hosp.ykiho, first)
    } catch (err) {
      console.log(`   - ${hosp.yadmNm}: 반복된 오류로 건너뜀 (${err.message.slice(0, 80)})`)
      first = false
      continue
    }
    first = false
    if (nonpayItems.length === 0) {
      console.log(`   - ${hosp.yadmNm}: 신고된 비급여 항목 없음, 건너뜀`)
      continue
    }
    for (const nonpay of nonpayItems) {
      providers.push({
        ykiho: hosp.ykiho,
        name: hosp.yadmNm,
        kind: mapKind(hosp.clCdNm),
        item: nonpay.npayKorNm,
        district,
        address: hosp.addr,
        lat: Number(hosp.YPos),
        lng: Number(hosp.XPos),
        priceMin: Number(nonpay.curAmt ?? nonpay.minAmt ?? 0),
        priceMax: Number(nonpay.curAmt ?? nonpay.maxAmt ?? nonpay.minAmt ?? 0),
        updated: formatDate(nonpay.adtFrDd),
      })
    }
    console.log(`   - ${hosp.yadmNm}: 항목 ${nonpayItems.length}건 확보`)
  }
  return providers
}

async function main() {
  console.log(`대상 시/군/구: ${TARGET_DISTRICTS.join(', ')}`)
  const existing = loadExistingProviders()
  // 이번에 다시 수집하는 구는 기존 것을 버리고 새로 넣는다 (중복 방지).
  const kept = existing.filter((p) => !TARGET_DISTRICTS.includes(p.district))
  console.log(`기존 데이터 ${existing.length}건 중 ${kept.length}건 유지 (${existing.length - kept.length}건은 이번에 새로 갱신)`)

  const newProviders = []
  for (const district of TARGET_DISTRICTS) {
    const result = await fetchDistrict(district)
    newProviders.push(...result)
  }

  const allProviders = [...kept, ...newProviders]
  if (allProviders.length === 0) {
    console.error('저장할 데이터가 하나도 없어요.')
    process.exit(1)
  }

  const outPath = path.join(ROOT, 'data', 'nonbenefit-prices.ts')
  const fileContent = `import type { NonBenefitProvider } from '../lib/types.js'\n\n// scripts/fetch-hira-data.mjs가 생성한다. 직접 수정하지 말고 스크립트를 다시 실행할 것.\nexport const providers: NonBenefitProvider[] = ${JSON.stringify(allProviders, null, 2)}\n`
  fs.writeFileSync(outPath, fileContent, 'utf-8')
  console.log(`\n완료: 이번에 ${newProviders.length}건 추가/갱신, 총 ${allProviders.length}건 저장 → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
