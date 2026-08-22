import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@materialpbx/client': fileURLToPath(new URL('../../packages/client/src/index.ts', import.meta.url)),
      '@materialpbx/design-integration': fileURLToPath(new URL('../../packages/design-integration/src/index.ts', import.meta.url)),
      '@materialpbx/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
    },
  },
})

