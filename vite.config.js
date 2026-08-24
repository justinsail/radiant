import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  // the phone's Settings shows the version, and reading package.json at build
  // time is the only source that cannot drift from what actually shipped
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5834',
      '/term': { target: 'ws://127.0.0.1:5834', ws: true }
    }
  }
})
