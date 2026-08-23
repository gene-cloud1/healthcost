import type { VercelRequest, VercelResponse } from '@vercel/node'
import { providers } from '../data/nonbenefit-prices.js'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const items = Array.from(new Set(providers.map((p) => p.item))).sort((a, b) => a.localeCompare(b, 'ko'))
  res.status(200).json({ items })
}
