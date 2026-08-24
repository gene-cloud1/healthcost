import type { NonBenefitProvider } from '../lib/types.js'
import rawProviders from './nonbenefit-prices.json'

// Keep the generated data out of this module so TypeScript does not infer a huge literal union.
export const providers = rawProviders as NonBenefitProvider[]
