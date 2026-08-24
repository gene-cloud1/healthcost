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

const dataDir = path.join(ROOT, 'data')
fs.mkdirSync(dataDir, { recursive: true })

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

  // HIRA 서버가 리소스풀 고갈 등으로 죽으면 HTTP 200에 resultCode!=00으로 응답한다
  // (예: resultCode:99 "ResourceLimitException"). SERVICETIMEOUT_ERROR 문자열 검사만으로는
  // 이런 케이스를 못 잡아서 "0건"으로 조용히 넘어가는 버그가 있었다 — resultCode도 같이 본다.
  let json = null
  let resultCode = null
  try {
    json = JSON.parse(text)
    resultCode = json?.response?.header?.resultCode ?? json?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode ?? null
  } catch {
    // 파싱 실패는 아래 isError 처리로 넘어간다 (json이 null로 남음)
  }
  const isSuccess = resultCode === '00' || resultCode === 0 || resultCode === '0'
  const isError = !res.ok || text.includes('SERVICETIMEOUT_ERROR') || json === null || !isSuccess

  if (isError) {
    if (retriesLeft > 0) {
      const reason = resultCode !== null ? `resultCode=${resultCode}` : `HTTP ${res.status}`
      console.log(`  (일시 오류(${reason}), ${retriesLeft}회 재시도 남음 — 3초 후 재시도)`)
      await sleep(3000)
      return callApi(baseUrl, extraParams, retriesLeft - 1)
    }
    throw new Error(`${baseUrl} 호출 실패: ${res.status} ${text.slice(0, 500)}`)
  }

  const items = json?.response?.body?.items?.item
  if (!items) return []
  return Array.isArray(items) ? items : [items]
}

async function findHospitalsInDistrict(district) {
  const found = []
  const seenYkiho = new Set()
  for (let page = 1; page <= MAX_PAGES && found.length < MAX_HOSPITALS; page += 1) {
    const items = await callApi(HOSP_URL, { numOfRows: PAGE_SIZE, pageNo: page })
    if (page === 1) {
      fs.writeFileSync(path.join(dataDir, '_debug-hosp-page1.json'), JSON.stringify(items.slice(0, 2), null, 2))
    }
    if (items.length === 0) break
    for (const item of items) {
      if (typeof item.addr === 'string' && item.addr.includes(district)) {
        // 페이지네이션이 정렬 기준 없이 도는 API라 페이지 사이에 같은 병원이 다시 나올 수
        // 있다 (실제로 관측됨: 페이지가 늘어날수록 매칭 수가 기대보다 계속 늘어남).
        // ykiho 기준으로 중복만 걸러내고, 새 병원이면 계속 담는다.
        if (seenYkiho.has(item.ykiho)) continue
        seenYkiho.add(item.ykiho)
        found.push(item)
        if (found.length >= MAX_HOSPITALS) break
      }
    }
    console.log(`  ${page}페이지 확인, 누적 ${district} 매칭 ${found.length}건 (중복 제외)`)
  }
  return found
}

async function findNonPaymentItems(ykiho, isFirst) {
  const items = await callApi(NONPAY_URL, { ykiho, numOfRows: 100, pageNo: 1 })
  if (isFirst) {
    fs.writeFileSync(path.join(dataDir, '_debug-nonpay-sample.json'), JSON.stringify(items, null, 2))
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
  const outPath = path.join(dataDir, 'nonbenefit-prices.ts')
  const fileContent = `import type { NonBenefitProvider } from '../lib/types.js'\n\n// scripts/fetch-hira-data.mjs가 생성한다. 직접 수정하지 말고 스크립트를 다시 실행할 것.\nexport const providers: NonBenefitProvider[] = ${JSON.stringify(providers, null, 2)}\n`
  fs.writeFileSync(outPath, fileContent, 'utf-8')
}

// 병원 단위 진행상황을 별도 파일에 기록해서, 중간에 프로세스가 죽어도 재실행 시
// 이미 "확실한 응답"(성공 또는 진짜 0건)을 받은 병원은 건너뛴다. 재시도를 다 쓰고
// 실패한 병원은 여기 안 남겨서, 재실행하면 다시 시도하게 된다.
function progressPath(district) {
  return path.join(dataDir, `_progress-${district}.json`)
}
function loadProgress(district) {
  const p = progressPath(district)
  if (!fs.existsSync(p)) return new Set()
  try {
    return new Set(JSON.parse(fs.readFileSync(p, 'utf-8')))
  } catch {
    return new Set()
  }
}
function saveProgress(district, doneSet) {
  fs.writeFileSync(progressPath(district), JSON.stringify([...doneSet]), 'utf-8')
}
function clearProgress(district) {
  const p = progressPath(district)
  if (fs.existsSync(p)) fs.unlinkSync(p)
}

// district의 새 데이터를 병원 하나 끝날 때마다 즉시 all/파일에 반영한다.
// all은 "이 district가 아닌 것들" + "이 district에서 지금까지 확보한 것들"로 계속 갱신된다.
async function fetchDistrict(district, all) {
  console.log(`\n[${district}] 소재 병원 목록 조회 중...`)
  const hospitals = await findHospitalsInDistrict(district)
  console.log(`   ${hospitals.length}개 병원 확보`)
  if (hospitals.length === 0) {
    console.log(`   [${district}] 병원을 하나도 못 찾았어요 — API 오류일 수 있어서 기존 데이터는 그대로 둔다`)
    return all
  }

  const done = loadProgress(district)
  const alreadyDistrictData = all.filter((p) => p.district === district)
  console.log(`   이전 진행 상황: ${done.size}개 병원 처리 완료 (재실행이면 이어서 진행)`)

  const remaining = hospitals.filter((h) => !done.has(h.ykiho))
  console.log(`[${district}] 병원별 신고 비급여 항목 조회 중... (${remaining.length}/${hospitals.length}곳 남음)`)

  let districtProviders = alreadyDistrictData
  let first = true
  for (const hosp of remaining) {
    if (!first) await sleep(1000)
    let nonpayItems
    try {
      nonpayItems = await findNonPaymentItems(hosp.ykiho, first)
    } catch (err) {
      console.log(`   - ${hosp.yadmNm}: 반복된 오류로 건너뜀, 다음 실행 때 재시도 (${err.message.slice(0, 80)})`)
      first = false
      continue
    }
    first = false
    // 여기까지 왔으면 서버로부터 확실한 응답(성공 또는 진짜 0건)을 받은 것이다.
    done.add(hosp.ykiho)
    saveProgress(district, done)

    if (nonpayItems.length === 0) {
      console.log(`   - ${hosp.yadmNm}: 신고된 비급여 항목 없음`)
      continue
    }
    const newRecords = nonpayItems.map((nonpay) => ({
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
    }))
    districtProviders = [...districtProviders.filter((p) => p.ykiho !== hosp.ykiho), ...newRecords]
    all = [...all.filter((p) => p.district !== district), ...districtProviders]
    saveProviders(all)
    console.log(`   - ${hosp.yadmNm}: 항목 ${nonpayItems.length}건 확보, 저장 완료 (누적 ${all.length}건)`)
  }

  if (done.size >= hospitals.length) {
    console.log(`   [${district}] 전체 ${hospitals.length}곳 처리 완료`)
    clearProgress(district)
  } else {
    console.log(`   [${district}] ${hospitals.length - done.size}곳 아직 미완료 (재시도 소진분) — 스크립트를 다시 실행하면 이어서 진행됨`)
  }

  return all
}

async function main() {
  console.log(`대상 시/군/구: ${TARGET_DISTRICTS.join(', ')}`)
  let all = loadExistingProviders()
  console.log(`기존 데이터 ${all.length}건에서 시작`)

  for (const district of TARGET_DISTRICTS) {
    try {
      all = await fetchDistrict(district, all)
    } catch (err) {
      console.log(`\n[${district}] 반복된 오류로 이번 구는 중단, 지금까지 확보한 데이터는 이미 저장됨 (${err.message.slice(0, 120)})`)
    }
  }

  if (all.length === 0) {
    console.error('저장할 데이터가 하나도 없어요.')
    process.exit(1)
  }

  saveProviders(all)
  console.log(`\n완료: 총 ${all.length}건 저장 → data/nonbenefit-prices.ts`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
