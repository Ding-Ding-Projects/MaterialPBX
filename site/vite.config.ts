import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import { sites } from '@openai/sites-vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const PUBLIC_HOSTS = {
  '/': 'https://materialpbx.yeredow264.chatgpt.site/',
  '/MaterialPBX/': 'https://ding-ding-projects.github.io/MaterialPBX/',
} as const

function materialPbxInstallerIcon() {
  return {
    name: 'materialpbx-installer-icon',
    apply: 'build' as const,
    async buildStart() {
      const source = await readFile(fileURLToPath(new URL('../assets/generated/materialpbx.ico', import.meta.url)))
      this.emitFile({ type: 'asset', fileName: 'materialpbx.ico', source })
    },
  }
}

function materialPbxPublicMetadata() {
  let publicBase = '/MaterialPBX/'
  return {
    name: 'materialpbx-public-metadata',
    apply: 'build' as const,
    configResolved(config: { base: string }) {
      publicBase = config.base
    },
    transformIndexHtml(html: string) {
      const publicUrl = PUBLIC_HOSTS[publicBase as keyof typeof PUBLIC_HOSTS]
      if (!publicUrl) throw new Error(`MaterialPBX has no public metadata host for Vite base ${publicBase}.`)
      return html
        .replaceAll('__MATERIALPBX_PUBLIC_URL__', publicUrl)
        .replaceAll('__MATERIALPBX_SOCIAL_PREVIEW_URL__', `${publicUrl}social-preview.png`)
    },
  }
}

export default defineConfig(async () => {
  const { cloudflare } = await import('@cloudflare/vite-plugin')

  return {
    base: '/MaterialPBX/',
    plugins: [vue(), sites(), materialPbxPublicMetadata(), materialPbxInstallerIcon(), cloudflare({ viteEnvironment: { name: 'server' } })],
    resolve: {
      alias: {
        '@materialpbx/client': fileURLToPath(new URL('../packages/client/src/index.ts', import.meta.url)),
        '@materialpbx/design-integration': fileURLToPath(new URL('../packages/design-integration/src/index.ts', import.meta.url)),
        '@materialpbx/ui': fileURLToPath(new URL('../packages/ui/src/index.ts', import.meta.url)),
      },
    },
    build: { outDir: 'dist', emptyOutDir: true },
  }
})
