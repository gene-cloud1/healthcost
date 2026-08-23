import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { searchProviders } from '../lib/search'
import type { NonBenefitProvider } from '../lib/types'

// package.json의 "type": "module" 때문에 정적 JSON import는 ESM 런타임에서
// import assertion을 요구해 Vercel Node 함수가 FUNCTION_INVOCATION_FAILED로 죽는다.
// fs로 직접 읽어서 그 문제를 피한다.
function loadProviders(): NonBenefitProvider[] {
  const raw = readFileSync(join(process.cwd(), 'data', 'nonbenefit-prices.json'), 'utf-8')
  return JSON.parse(raw) as NonBenefitProvider[]
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const district = typeof req.query.district === 'string' ? req.query.district : undefined
  const lat = req.query.lat ? Number(req.query.lat) : undefined
  const lng = req.query.lng ? Number(req.query.lng) : undefined
  const sort = req.query.sort === 'distance' ? 'distance' : 'price'

  const results = searchProviders(loadProviders(), { district, lat, lng, sort })
  res.status(200).json({ results })
}
