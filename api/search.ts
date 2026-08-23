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
