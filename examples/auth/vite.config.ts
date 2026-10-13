import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig, type UserConfig } from 'vite'

/** Where `pnpm dev` serves the page: the origin Yielded trusts a sign-in from. */
export const DEV_ORIGIN = 'http://127.0.0.1:5176'
/** Where `pnpm dev` starts the auth server Vite proxies to and renders pages through. */
export const SERVER_PORT = 8790

/**
 * The dev server for a page at `origin` over the auth server at
 * `authServer`: the browser's sign-in and reads go to the page's own origin,
 * which carries the cookie, and are proxied there; each page is rendered by
 * `src/entry.server.ts`, which reads from there directly.
 */
export const configFor = (options: {
  readonly origin: string
  readonly authServer: string
}): UserConfig => ({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
  // Read by the server entry only; the page's script never names it.
  define: { 'import.meta.env.AUTH_SERVER': JSON.stringify(options.authServer) },
  server: {
    host: '127.0.0.1',
    port: Number(new URL(options.origin).port),
    // The origin Yielded trusts is this one, so it must not move to a free port.
    strictPort: true,
    proxy: {
      '/auth': { target: options.authServer },
      '/remote': { target: options.authServer },
      // The board's socket: an upgrade, opened with the page's cookie and Origin.
      '/sync': { target: options.authServer, ws: true },
    },
  },
  plugins: [foldkit({ ssr: { serverEntry: '/src/entry.server.ts', origin: options.origin } })],
})

export default defineConfig(
  configFor({ origin: DEV_ORIGIN, authServer: `http://127.0.0.1:${SERVER_PORT}` }),
)
