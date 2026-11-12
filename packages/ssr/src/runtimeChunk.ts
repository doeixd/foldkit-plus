/**
 * `runtimeChunk`, from `foldkit-ssr/vite`: tells `foldkit-ssr/loader` where a
 * client build put the runtime's chunk, so the loader can fetch it without
 * running it. Kept apart from the static site's plugin, which imports the
 * server renderer, so a config can import this one by path.
 */
import type { Plugin } from 'vite'

/** `runtimeUrl`'s placeholder, as `runtimeUrl.ts` gives it, in either quote. */
const PLACEHOLDER = /(\bruntimeUrl(?:\s*:\s*string)?\s*=\s*)(['"])foldkit-ssr:runtime-url\2/

/**
 * Emits `entry`, the module the loader's `runtime` imports, as a chunk of
 * the client build, and writes that chunk's address into the loader. The
 * chunk is the one the dynamic import loads: the bundler gives one module
 * one chunk. A development server and a server build leave the loader
 * without an address, and it fetches the chunk as it runs it.
 */
export const runtimeChunk = (options: {
  /** The runtime's module, root-relative (`/src/client/entry.ts`), as the loader imports it. */
  readonly entry: string
}): Plugin => {
  let reference: string | undefined
  return {
    name: 'foldkit-ssr:runtime-chunk',
    apply: 'build',
    applyToEnvironment: environment => environment.name === 'client',
    async buildStart() {
      const resolved = await this.resolve(options.entry)
      if (resolved === null) {
        throw new Error(`foldkit-ssr: runtimeChunk cannot resolve its entry ${options.entry}`)
      }
      reference = this.emitFile({ type: 'chunk', id: resolved.id })
    },
    transform(code) {
      if (reference === undefined || !PLACEHOLDER.test(code)) return null
      return {
        code: code.replace(PLACEHOLDER, `$1import.meta.ROLLUP_FILE_URL_${reference}`),
        map: null,
      }
    },
  }
}
