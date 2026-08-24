import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'data', 'nonbenefit-prices.json')
const regionsPath = path.join(root, 'data', 'regions.ts')
const outputPath = path.join(root, 'public', 'search')
const stagingPath = path.join(root, 'public', '.search-build')

function normalize(value) {
  return value.replace(/\s+/g, '')
}

function loadRegionMap() {
  const source = fs.readFileSync(regionsPath, 'utf8')
  const json = source.slice(source.indexOf('= ') + 2).trim().replace(/;\s*$/, '')
  return JSON.parse(json)
}

const regionMap = loadRegionMap()
const regionChoices = Object.entries(regionMap)
  .flatMap(([city, districts]) => Object.keys(districts).map((district) => ({ city, district, needle: normalize(`${city}${district}`) })))
  .sort((a, b) => b.needle.length - a.needle.length)

function districtKey(provider) {
  const address = normalize(provider.address ?? '')
  const matched = regionChoices.find((choice) => address.includes(choice.needle))
  if (matched) {
    return `${matched.city}|${matched.district}`
  }

  if (provider.address?.startsWith('세종특별자치시') && provider.district === '세종시') {
    return '세종특별자치시|세종시'
  }

  throw new Error(`Cannot map provider to a UI region: ${provider.ykiho}`)
}

function fileName(key) {
  return `districts/${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}.json`
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing source data: ${sourcePath}`)
}

const providers = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const byDistrict = new Map()
const items = new Set()

for (const provider of providers) {
  const key = districtKey(provider)
  const records = byDistrict.get(key) ?? []
  records.push(provider)
  byDistrict.set(key, records)
  items.add(provider.item)
}

fs.rmSync(stagingPath, { recursive: true, force: true })
fs.mkdirSync(path.join(stagingPath, 'districts'), { recursive: true })

const districtFiles = {}
for (const [key, records] of byDistrict) {
  const relativePath = fileName(key)
  fs.writeFileSync(path.join(stagingPath, relativePath), JSON.stringify(records), 'utf8')
  districtFiles[key] = relativePath
}

// Sejong is selected by neighborhood in the UI while the source reports one city-level district.
const sejongFile = districtFiles['세종특별자치시|세종시']
if (sejongFile) {
  for (const district of Object.keys(regionMap['세종특별자치시'])) {
    districtFiles[`세종특별자치시|${district}`] = sejongFile
  }
}

const catalog = {
  version: 1,
  generatedAt: new Date().toISOString(),
  items: [...items].sort((a, b) => a.localeCompare(b, 'ko')),
  districtFiles,
}
fs.writeFileSync(path.join(stagingPath, 'catalog.json'), JSON.stringify(catalog), 'utf8')

fs.rmSync(outputPath, { recursive: true, force: true })
fs.renameSync(stagingPath, outputPath)

console.log(`Search catalog: ${catalog.items.length} items, ${byDistrict.size} districts, ${providers.length} records`)
