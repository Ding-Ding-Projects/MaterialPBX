import { fileURLToPath, URL } from 'node:url'
import { sites } from '@openai/sites-vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig(async () => {
  const { cloudflare } = await import('@cloudflare/vite-plugin')

  return {
    base: '/MaterialPBX/',
    plugins: [vue(), sites(), cloudflare({ viteEnvironment: { name: 'server' } })],
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
