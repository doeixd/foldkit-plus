/**
 * The runtime chunk's built address, for `foldkit-ssr/loader` to fetch
 * without running it. `runtimeChunk` from `foldkit-ssr/vite` replaces the
 * string `runtimeUrl` is given in a client build with the address the
 * bundler gives the chunk; anywhere else it stays `UNBUILT`, and the loader
 * fetches nothing early. Imports nothing, as the loader must not.
 */
export const UNBUILT = 'foldkit-ssr:runtime-url'

export const runtimeUrl: string = 'foldkit-ssr:runtime-url'
