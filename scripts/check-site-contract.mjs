import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const installerIconSource = await readFile(resolve(root, 'assets/generated/materialpbx.ico'))
const files = {
  app: await readFile(resolve(root, 'packages/ui/src/MaterialPbxApp.vue'), 'utf8'),
  client: await readFile(resolve(root, 'packages/client/src/index.ts'), 'utf8'),
  styles: await readFile(resolve(root, 'packages/ui/src/styles.css'), 'utf8'),
  html: await readFile(resolve(root, 'site/index.html'), 'utf8'),
  hosting: await readFile(resolve(root, 'site/.openai/hosting.json'), 'utf8'),
  package: await readFile(resolve(root, 'site/package.json'), 'utf8'),
  desktopPackage: await readFile(resolve(root, 'apps/desktop/package.json'), 'utf8'),
  rootPackage: await readFile(resolve(root, 'package.json'), 'utf8'),
  vite: await readFile(resolve(root, 'site/vite.config.ts'), 'utf8'),
  workflow: await readFile(resolve(root, '.github/workflows/pages.yml'), 'utf8'),
}

const required = [
  ['beginner-first headline', 'app', 'Your calls.<br><span>Drawn out,</span><br>not buried in forms.'],
  ['plain PBX definition', 'app', 'A PBX is simply the private phone system'],
  ['public non-runtime boundary', 'app', 'It is not the primary phone-system application, does not control a PBX, and does not imitate a live PBX in the browser.'],
  ['dedicated public home shell', 'app', "props.surface !== 'site' || activePage !== 'home'"],
  ['public Home omits connection diagnostics', 'app', `v-else-if="props.surface !== 'site'" :type="connectionColor as any"`],
  ['interactive call route studio', 'app', 'id="site-route-preview-title">Call route simulation'],
  ['typed call route conditions', 'app', "type SiteDemoMode = 'open' | 'closed' | 'overflow'"],
  ['production deployment path', 'app', 'Read self-hosting architecture'],
  ['single candidate version', 'app', "const candidateVersion = '0.1.2'"],
  ['derived published installer path', 'app', 'MaterialPBX-${latestPublishedVersion}-x64-Setup.exe`'],
  ['derived visible candidate badge', 'app', 'CANDIDATE {{ candidateVersion }} · NOT YET PUBLISHED'],
  ['wide public header utilities', 'app', `:prepend-icon="siteIcons.bell" @click="openPage('notifications')">Notifications</v-btn>`],
  ['guaranteed SVG header icons', 'app', 'mdiBellOutline'],
  ['narrow website actions overflow', 'app', 'aria-label="More website actions"'],
  ['overflow local search', 'app', 'label="Filter website actions"'],
  ['overflow anchored regex builder', 'app', 'aria-label="Open regex builder for website actions menu"'],
  ['overflow keyboard entry', 'app', '@keydown.down.prevent="focusFirstSiteHeaderMenuAction"'],
  ['overflow two-stage escape', 'app', '@keydown.esc.stop="onSiteHeaderMenuEscape"'],
  ['narrow persistent Get app action', 'app', ':aria-label="`Download latest published MaterialPBX ${latestPublishedVersion} desktop lab in a new tab`"'],
  ['intermediate first-fold route preview', 'styles', '.site-hero-v2 { grid-template-columns: minmax(0, .94fr) minmax(330px, .74fr); min-height: min(760px, calc(100vh - 96px)); gap: 24px; padding: 36px; }'],
  ['tight-width compact Get app', 'styles', '.site-get-app-label { display: none; }'],
  ['reactive interface preview', 'app', 'const sitePreview = reactive('],
  ['live preview summary', 'app', 'sitePreviewSummary'],
  ['derived complete feature groups', 'app', 'const siteFeatureGroups = computed('],
  ['rendered complete feature map', 'app', 'v-for="item in group.items"'],
  ['no-nagging commitment', 'app', 'payment, review, or donation nags'],
  ['user reduced-motion class', 'app', "'reduced-motion': settings.reducedMotion"],
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
  ['mobile vertical call controls', 'styles', '.site-studio-modes { grid-template-columns: 1fr; }'],
  ['mobile single-column product story', 'styles', '.site-bento { grid-template-columns: 1fr; grid-template-rows: auto; }'],
  ['managed hosting project', 'hosting', '"project_id"'],
  ['Sites build adapter', 'vite', 'sites()'],
  ['Cloudflare worker output', 'vite', "viteEnvironment: { name: 'server' }"],
  ['GitHub Pages client artifact', 'workflow', 'path: site/dist/client'],
  ['public URL placeholder', 'html', '__MATERIALPBX_PUBLIC_URL__'],
  ['social preview placeholder', 'html', '__MATERIALPBX_SOCIAL_PREVIEW_URL__'],
  ['Pages public metadata host', 'vite', "'/MaterialPBX/': 'https://ding-ding-projects.github.io/MaterialPBX/'"],
  ['managed public metadata host', 'vite', "'/': 'https://materialpbx.yeredow264.chatgpt.site/'"],
  ['build-time public metadata', 'vite', 'materialPbxPublicMetadata()'],
  ['large social card', 'html', 'summary_large_image'],
  ['managed hosting package', 'package', '@openai/sites-vite-plugin'],
  ['public installer icon URL', 'desktopPackage', '"iconUrl": "https://ding-ding-projects.github.io/MaterialPBX/materialpbx.ico"'],
  ['canonical installer icon source', 'vite', "new URL('../assets/generated/materialpbx.ico', import.meta.url)"],
  ['public installer icon asset', 'vite', "fileName: 'materialpbx.ico'"],
  ['pure CI build boundary', 'package', '"build": "vite build"'],
  ['local Pages build-boundary check', 'package', 'vite build && node ../scripts/check-site-contract.mjs /MaterialPBX/ https://ding-ding-projects.github.io/MaterialPBX/'],
  ['managed build-boundary check', 'package', 'vite build --base=/ && node ../scripts/check-site-contract.mjs /'],
  ['explicit Pages check command', 'rootPackage', '"check:site:pages": "node scripts/check-site-contract.mjs /MaterialPBX/ https://ding-ding-projects.github.io/MaterialPBX/"'],
  ['explicit managed check command', 'rootPackage', '"check:site:managed": "node scripts/check-site-contract.mjs / https://materialpbx.yeredow264.chatgpt.site/"'],
  ['serialized Pages deployment', 'workflow', 'group: pages-production'],
  ['non-cancelling Pages deployment', 'workflow', 'cancel-in-progress: false'],
  ['main-only Pages deployment', 'workflow', "github.ref != 'refs/heads/main'"],
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
const expectedPublicOrigin = process.argv[3]
if (expectedBase) {
  if (!expectedPublicOrigin) {
    console.error('A built-site check requires its exact public origin.')
    process.exit(1)
  }
  let parsedPublicOrigin
  try {
    parsedPublicOrigin = new URL(expectedPublicOrigin)
  } catch {
    console.error(`Expected public origin is not an absolute URL: ${expectedPublicOrigin}`)
    process.exit(1)
  }
  if (parsedPublicOrigin.protocol !== 'https:' || parsedPublicOrigin.href !== expectedPublicOrigin) {
    console.error(`Expected public origin must be one canonical absolute HTTPS URL: ${expectedPublicOrigin}`)
    process.exit(1)
  }
  const builtHtml = await readFile(resolve(root, 'site/dist/client/index.html'), 'utf8')
  let builtInstallerIcon
  try {
    builtInstallerIcon = await readFile(resolve(root, 'site/dist/client/materialpbx.ico'))
  } catch {
    console.error('Built site is missing materialpbx.ico.')
    process.exit(1)
  }
  if (!builtInstallerIcon.equals(installerIconSource)) {
    console.error('Built installer icon is not byte-identical to assets/generated/materialpbx.ico.')
    process.exit(1)
  }
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
  const expectedImage = `${expectedPublicOrigin}social-preview.png`
  const validateBuiltMetadata = (html) => {
    const failures = []
    if (html.includes('__MATERIALPBX_PUBLIC_URL__') || html.includes('__MATERIALPBX_SOCIAL_PREVIEW_URL__')) {
      failures.push('unresolved-placeholder')
    }
    const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0])
    const readAttributes = (tag) => Object.fromEntries(
      [...tag.matchAll(/([:\w-]+)=["']([^"']*)["']/g)].map((match) => [match[1].toLowerCase(), match[2]]),
    )
    const metadata = metaTags.map(readAttributes)
    const oneMeta = (attribute, key) => {
      const matches = metadata.filter((entry) => entry[attribute] === key)
      if (matches.length !== 1 || !matches[0].content) {
        failures.push(`cardinality:${attribute}:${key}`)
        return ''
      }
      return matches[0].content
    }
    const ogUrl = oneMeta('property', 'og:url')
    const ogImage = oneMeta('property', 'og:image')
    if (ogUrl !== expectedPublicOrigin) failures.push(`og:url:${ogUrl}`)
    if (ogImage !== expectedImage) failures.push(`og:image:${ogImage}`)
    for (const [attribute, key, expected] of [
      ['property', 'og:image:width', '1200'],
      ['property', 'og:image:height', '630'],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'theme-color', '#6750A4'],
    ]) {
      if (oneMeta(attribute, key) !== expected) failures.push(`${key}:value`)
    }
    if (!oneMeta('property', 'og:image:alt').trim()) failures.push('og:image:alt:empty')
    return failures
  }
  const builtMetadataFailures = validateBuiltMetadata(builtHtml)
  if (builtMetadataFailures.length) {
    console.error(`Built public metadata failed: ${builtMetadataFailures.join(', ')}`)
    process.exit(1)
  }
  const metadataMutations = [
    builtHtml.replace(expectedPublicOrigin, 'https://wrong.example.invalid/'),
    builtHtml.replace(expectedImage, 'https://wrong.example.invalid/social-preview.png'),
    builtHtml.replace('</head>', '<meta property="og:url" content="https://duplicate.example.invalid/" /></head>'),
    builtHtml.replace('</head>', '<meta property="og:image" content="__MATERIALPBX_SOCIAL_PREVIEW_URL__" /></head>'),
  ]
  for (const [index, mutation] of metadataMutations.entries()) {
    if (!validateBuiltMetadata(mutation).length) {
      console.error(`Built metadata negative regression ${index + 1} did not turn red.`)
      process.exit(1)
    }
    if (validateBuiltMetadata(builtHtml).length) {
      console.error(`Built metadata did not return green after negative regression ${index + 1}.`)
      process.exit(1)
    }
  }
}

console.log(`Site contract verified: ${required.length} exact requirements, one hosting identifier boundary, and ${required.length} independent source red-then-green negative regressions${expectedBase ? ` plus four built-metadata red-then-green negatives, with every local asset at built base ${expectedBase}, exact public metadata at ${expectedPublicOrigin}, and a byte-identical public installer icon` : ''}.`)
