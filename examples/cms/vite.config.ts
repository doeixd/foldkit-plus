import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5175,
    // The client posts to `/remote` on its own origin; proxy it to the server.
    proxy: { '/remote': { target: 'http://127.0.0.1:8789' } },
  },
})
