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

// 공공데이터포털 일반인증키는 계정 공통이라 이 스크립트도 같은 키를 쓴다.
// (행정안전부_행정표준코드_법정동코드 API는 별도 활용신청/승인이 필요 — 이미 승인됨)
const REGION_URL = 'https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList'
const PAGE_SIZE = 1000
const MAX_PAGES = 40

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callApi(pageNo, retriesLeft = 5) {
  const url = new URL(REGION_URL)
  url.searchParams.set('serviceKey', API_KEY)
  url.searchParams.set('type', 'json')
  url.searchParams.set('flag', 'Y')
  url.searchParams.set('pageNo', String(pageNo))
  url.searchParams.set('numOfRows', String(PAGE_SIZE))
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok || text.includes('SERVICETIMEOUT_ERROR')) {
    if (retriesLeft > 0) {
      console.log(`  (일시 오류, ${retriesLeft}회 재시도 남음 — 3초 후 재시도)`)
      await sleep(3000)
      return callApi(pageNo, retriesLeft - 1)
    }
    throw new Error(`${REGION_URL} 호출 실패: ${res.status} ${text.slice(0, 300)}`)
  }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`JSON 파싱 실패 — 응답 원문:\n${text.slice(0, 500)}`)
  }
  const head = json?.StanReginCd?.[0]?.head
  const totalCount = head?.find((h) => 'totalCount' in h)?.totalCount ?? 0
  const rows = json?.StanReginCd?.[1]?.row ?? []
  return { totalCount, rows }
}

async function main() {
  console.log('법정동코드 전체 조회 중 (시/도 · 시/군/구 레벨만 추림)...')
  const sidoSet = new Set()
  const sigunguMap = new Map() // sido -> Set(sigungu)
  let totalCount = Infinity
  let fetched = 0

  for (let page = 1; page <= MAX_PAGES && fetched < totalCount; page += 1) {
    const { totalCount: tc, rows } = await callApi(page)
    totalCount = tc
    fetched += rows.length
    for (const row of rows) {
      const tokens = row.locatadd_nm.trim().split(/\s+/)
      if (tokens.length === 1) {
        sidoSet.add(tokens[0])
      } else if (tokens.length === 2) {
        const [sido, sigungu] = tokens
        if (!sigunguMap.has(sido)) sigunguMap.set(sido, new Set())
        sigunguMap.get(sido).add(sigungu)
      }
    }
    console.log(`  ${page}페이지 확인 (${fetched}/${totalCount}건 누적)`)
    if (rows.length === 0) break
  }

  // sido_cd 순서를 보존하려고 첫 조회 응답 순서 대신, 자모 정렬은 실제 관례와 다르므로
  // 그냥 이름 가나다순으로 정렬한다 (코드 순서가 필요하면 region_cd를 같이 저장해야 함).
  const sidoNames = Array.from(sidoSet).sort((a, b) => a.localeCompare(b, 'ko'))
  const regionMap = {}
  for (const sido of sidoNames) {
    const sigunguSet = sigunguMap.get(sido) ?? new Set()
    regionMap[sido] = Array.from(sigunguSet).sort((a, b) => a.localeCompare(b, 'ko'))
  }

  if (sidoNames.length === 0) {
    console.error('시/도를 하나도 못 찾았어요. 응답 구조(locatadd_nm 필드명)를 확인하세요.')
    process.exit(1)
  }

  const outPath = path.join(ROOT, 'data', 'regions.ts')
  const fileContent = `// scripts/fetch-region-codes.mjs가 생성한다. 직접 수정하지 말고 스크립트를 다시 실행할 것.\n// 행정안전부 법정동코드(StanReginCd) 기준 시/도 -> 시/군/구 목록.\nexport const regionMap: Record<string, string[]> = ${JSON.stringify(regionMap, null, 2)}\n`
  fs.writeFileSync(outPath, fileContent, 'utf-8')
  console.log(`완료: 시/도 ${sidoNames.length}개, 시/군/구 총 ${Object.values(regionMap).reduce((s, a) => s + a.length, 0)}개 저장 → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
