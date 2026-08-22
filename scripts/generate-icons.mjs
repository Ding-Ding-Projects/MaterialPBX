import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'assets', 'generated')
await mkdir(out, { recursive: true })
const svg = await readFile(path.join(root, 'assets', 'materialpbx-logo.svg'))
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = []
for (const size of sizes) {
  const bytes = await sharp(svg).resize(size, size).png().toBuffer()
  const target = path.join(out, `materialpbx-${size}.png`)
  await writeFile(target, bytes)
  pngs.push(target)
}
await writeFile(path.join(out, 'materialpbx.png'), await sharp(svg).resize(512, 512).png().toBuffer())
await writeFile(path.join(out, 'materialpbx.ico'), await pngToIco(pngs))

