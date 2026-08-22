import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const logo = await readFile(path.join(root, 'assets', 'materialpbx-logo.svg'))
const logoPng = await sharp(logo).resize(300, 300).png().toBuffer()
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#17131f"/><rect x="48" y="48" width="1104" height="534" rx="44" fill="#211b2b" stroke="#4a4458" stroke-width="2"/><image x="92" y="165" width="300" height="300" href="data:image/png;base64,${logoPng.toString('base64')}"/><text x="450" y="258" fill="#e8def8" font-family="Arial,sans-serif" font-size="84" font-weight="700">MaterialPBX</text><text x="454" y="326" fill="#cac4d0" font-family="Arial,sans-serif" font-size="34">FreePBX and Asterisk, made visual</text><text x="454" y="388" fill="#d0bcff" font-family="Arial,sans-serif" font-size="27">Guided setup · Hosted control · Desktop lab</text></svg>`
const png = await sharp(Buffer.from(svg)).png().toBuffer()
await writeFile(path.join(root, 'social-preview.png'), png)
await mkdir(path.join(root, 'site', 'public'), { recursive: true })
await writeFile(path.join(root, 'site', 'public', 'social-preview.png'), png)

