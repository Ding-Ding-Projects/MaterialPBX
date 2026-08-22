import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const files = {
  app: await readFile(resolve(root, 'packages/ui/src/MaterialPbxApp.vue'), 'utf8'),
  client: await readFile(resolve(root, 'packages/client/src/index.ts'), 'utf8'),
  styles: await readFile(resolve(root, 'packages/ui/src/styles.css'), 'utf8'),
  html: await readFile(resolve(root, 'site/index.html'), 'utf8'),
  hosting: await readFile(resolve(root, 'site/.openai/hosting.json'), 'utf8'),
  package: await readFile(resolve(root, 'site/package.json'), 'utf8'),
  rootPackage: await readFile(resolve(root, 'package.json'), 'utf8'),
  vite: await readFile(resolve(root, 'site/vite.config.ts'), 'utf8'),
  workflow: await readFile(resolve(root, '.github/workflows/pages.yml'), 'utf8'),
}

const required = [
  ['beginner-first headline', 'app', 'Calling for everyone, without the wall of forms'],
  ['plain PBX definition', 'app', 'A PBX is simply the private phone system'],
  ['public non-runtime boundary', 'app', 'The installed or hosted product is what controls a real phone system.'],
  ['visual call path', 'app', 'Example visual call path: public number, greeting, team, voicemail'],
  ['production deployment path', 'app', 'Read the deployment guide'],
  ['stable installer path', 'app', '/releases/latest/download/MaterialPBX-0.1.0-x64-Setup.exe'],
  ['reactive interface preview', 'app', 'const sitePreview = reactive('],
  ['live preview summary', 'app', 'sitePreviewSummary'],
  ['derived complete feature map', 'app', 'v-for="item in productFeaturePages"'],
  ['ring-groups destination', 'app', "{ id: 'ring-groups'"],
  ['typed client ring-groups union', 'client', "| 'ivrs' | 'queues' | 'ring-groups' | 'conferences'"],
  ['client ring-groups response parser', 'client', "'ivrs','queues','ring-groups','conferences'"],
  ['UI ring-groups resource dispatch', 'app', "'ivrs','queues','ring-groups','conferences'"],
  ['guided ring-groups editor', 'app', "'ring-groups': ["],
  ['visual ring-groups control room', 'app', "'ring-groups': { eyebrow: 'RING GROUP CONTROL'"],
  ['ring-groups member copy', 'app', "activePage.value === 'ring-groups' ? 'Ring-group members' : 'Queue members'"],
  ['ring-groups empty-state copy', 'app', "activePage.value === 'ring-groups' ? 'No members yet. A ring group needs at least one phone or extension.'"],
  ['site planning export', 'app', 'function exportOnboardingPlan()'],
  ['site-specific onboarding boundary', 'app', 'This public walkthrough creates a local planning checklist only.'],
  ['SVG icon paths', 'app', 'mdiRocketLaunchOutline'],
  ['mobile vertical call path', 'styles', '.site-call-branches { width: 3px; height: 24px; border: 0;'],
  ['managed hosting project', 'hosting', '"project_id"'],
  ['Sites build adapter', 'vite', 'sites()'],
  ['Cloudflare worker output', 'vite', "viteEnvironment: { name: 'server' }"],
  ['GitHub Pages client artifact', 'workflow', 'path: site/dist/client'],
  ['absolute social preview', 'html', 'https://ding-ding-projects.github.io/MaterialPBX/social-preview.png'],
  ['large social card', 'html', 'summary_large_image'],
  ['managed hosting package', 'package', '@openai/sites-vite-plugin'],
  ['Pages build-boundary check', 'package', 'vite build && node ../scripts/check-site-contract.mjs /MaterialPBX/'],
  ['managed build-boundary check', 'package', 'vite build --base=/ && node ../scripts/check-site-contract.mjs /'],
  ['explicit Pages check command', 'rootPackage', '"check:site:pages": "node scripts/check-site-contract.mjs /MaterialPBX/"'],
  ['explicit managed check command', 'rootPackage', '"check:site:managed": "node scripts/check-site-contract.mjs /"'],
]

function findMissing(sources) {
  return required.filter(([, sourceName, needle]) => !sources[sourceName].includes(needle))
}

const missing = findMissing(files)
if (missing.length) {
  for (const [name] of missing) console.error(`Missing site contract: ${name}`)
  process.exit(1)
}

const parsedHosting = JSON.parse(files.hosting)
if (!/^appgprj_[a-z0-9]+$/.test(parsedHosting.project_id ?? '')) {
  console.error('Managed hosting project_id is absent or malformed.')
  process.exit(1)
}

for (const [name, sourceName, needle] of required) {
  const deliberatelyBroken = { ...files, [sourceName]: files[sourceName].replaceAll(needle, '__REMOVED_SITE_CONTRACT__') }
  const negativeResult = findMissing(deliberatelyBroken)
  if (negativeResult.length !== 1 || negativeResult[0][0] !== name) {
    console.error(`Site contract negative regression did not turn only ${name} red.`)
    process.exit(1)
  }
  if (findMissing(files).length) {
    console.error(`Site contract did not return green after restoring ${name}.`)
    process.exit(1)
  }
}

const expectedBase = process.argv[2]
if (expectedBase) {
  const builtHtml = await readFile(resolve(root, 'site/dist/client/index.html'), 'utf8')
  const assetPrefix = `${expectedBase.replace(/\/$/, '')}/assets/`.replace(/^\/\//, '/')
  const localAssetUrls = [...builtHtml.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((url) => !/^(?:https?:|data:|#)/i.test(url))
  if (!localAssetUrls.length) {
    console.error('Built site has no local script or stylesheet URLs to validate.')
    process.exit(1)
  }
  const incorrectUrls = localAssetUrls.filter((url) => !url.startsWith(assetPrefix))
  if (incorrectUrls.length) {
    console.error(`Built site has local asset URLs outside expected base ${expectedBase}: ${incorrectUrls.join(', ')}`)
    process.exit(1)
  }
}

console.log(`Site contract verified: ${required.length} exact requirements, one hosting identifier boundary, and ${required.length} independent red-then-green negative regressions${expectedBase ? ` with every local asset at built base ${expectedBase}` : ''}.`)
