import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const files = {
  app: await readFile(resolve(root, 'packages/ui/src/MaterialPbxApp.vue'), 'utf8'),
  html: await readFile(resolve(root, 'site/index.html'), 'utf8'),
  hosting: await readFile(resolve(root, 'site/.openai/hosting.json'), 'utf8'),
  package: await readFile(resolve(root, 'site/package.json'), 'utf8'),
  vite: await readFile(resolve(root, 'site/vite.config.ts'), 'utf8'),
  workflow: await readFile(resolve(root, '.github/workflows/pages.yml'), 'utf8'),
}

const required = [
  ['beginner-first headline', files.app, 'Calling for everyone, without the wall of forms'],
  ['plain PBX definition', files.app, 'A PBX is simply the private phone system'],
  ['public non-runtime boundary', files.app, 'The installed or hosted product is what controls a real phone system.'],
  ['visual call path', files.app, 'Example visual call path: public number, greeting, team, voicemail'],
  ['production deployment path', files.app, 'Read the deployment guide'],
  ['stable installer path', files.app, '/releases/latest/download/MaterialPBX-0.1.0-x64-Setup.exe'],
  ['managed hosting project', files.hosting, '"project_id"'],
  ['Sites build adapter', files.vite, 'sites()'],
  ['Cloudflare worker output', files.vite, "viteEnvironment: { name: 'server' }"],
  ['GitHub Pages client artifact', files.workflow, 'path: site/dist/client'],
  ['absolute social preview', files.html, 'https://ding-ding-projects.github.io/MaterialPBX/social-preview.png'],
  ['large social card', files.html, 'summary_large_image'],
  ['managed hosting package', files.package, '@openai/sites-vite-plugin'],
]

const missing = required.filter(([, source, needle]) => !source.includes(needle))
if (missing.length) {
  for (const [name] of missing) console.error(`Missing site contract: ${name}`)
  process.exit(1)
}

const parsedHosting = JSON.parse(files.hosting)
if (!/^appgprj_[a-z0-9]+$/.test(parsedHosting.project_id ?? '')) {
  console.error('Managed hosting project_id is absent or malformed.')
  process.exit(1)
}

console.log(`Site contract verified: ${required.length} exact requirements and one hosting identifier boundary.`)
