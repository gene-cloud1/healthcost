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

  // JSON이 아니라 .ts 모듈로 저장한다: Vercel 서버리스 함수가 런타임에 파일시스템에서
  // 읽으면 파일 번들링 누락(FUNCTION_INVOCATION_FAILED) 위험이 있어서, import로 직접
  // 코드에 박아 넣는 방식이 안전하다.
  const outPath = path.join(ROOT, 'data', 'nonbenefit-prices.ts')
  const fileContent = `import type { NonBenefitProvider } from '../lib/types'\n\n// scripts/fetch-hira-data.mjs가 생성한다. 직접 수정하지 말고 스크립트를 다시 실행할 것.\nexport const providers: NonBenefitProvider[] = ${JSON.stringify(providers, null, 2)}\n`
  fs.writeFileSync(outPath, fileContent, 'utf-8')
  console.log(`3) 완료: ${providers.length}건 저장 → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
