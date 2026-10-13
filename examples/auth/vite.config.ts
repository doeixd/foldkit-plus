import { defineConfig } from 'vite'

/** Where `pnpm dev` serves the page: the origin Yielded trusts a sign-in from. */
export const DEV_ORIGIN = 'http://127.0.0.1:5176'
/** Where `pnpm dev` starts the server Vite proxies to. */
export const SERVER_PORT = 8790

export default defineConfig({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  server: {
    host: '127.0.0.1',
    port: Number(new URL(DEV_ORIGIN).port),
    // The origin Yielded trusts is this one, so it must not move to a free port.
    strictPort: true,
    // Sign-in and reads go to the page's own origin, which carries the cookie.
    proxy: {
      '/auth': { target: `http://127.0.0.1:${SERVER_PORT}` },
      '/remote': { target: `http://127.0.0.1:${SERVER_PORT}` },
    },
  },
})
