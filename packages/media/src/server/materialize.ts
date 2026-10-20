import { nonNegativeInteger, positiveInteger } from '../limits.js'
import { Answer, headersFor } from './headers.js'

/** A variant written out as a file, at its own URL's path. */
export interface Materialized {
  readonly file: string
  readonly contents: Uint8Array
}

// A hosted variant's path, wherever a page names one: in a `srcset`, a `src`, a preload.
const VARIANT_PATH = /\/_image\/[0-9a-f]{64}\/[^\s"',)<>]+/g

// Cloudflare Pages serves at most 20,000 files a site on its free plan.
const DEFAULT_MAX_FILES = 20_000

const PATTERN = '/_image/*'

/**
 * The `_headers` rule (Cloudflare Pages, Netlify) a host needs for variants
 * written out as files: what the server itself sends a variant, from the same
 * `headersFor`, less the `ETag` and `Server-Timing` of one answer.
 */
export const headersRule = (): string => {
  const headers = headersFor(Answer.cases.Variant.make({ etag: '', from: 'made' }))
  const lines = Object.entries(headers)
    .filter(([name]) => name !== 'etag' && name !== 'server-timing')
    .map(([name, value]) => `  ${name}: ${value}`)
  return [PATTERN, ...lines].join('\n') + '\n'
}

/**
 * Every hosted variant the built pages name, made through `fetch` (the media
 * server's own handler, `serveFetch`) and returned as files at their own
 * paths, for `foldkit-ssr`'s `emit`. `Provider.hosted` then works on a static
 * host with no server at all. With a `Variants` store on disk, a second build
 * writes without encoding.
 *
 * It fails the build, naming every one, when a variant cannot be made (a
 * page would show a broken image), when there would be more than `maxFiles`,
 * and, given the site's `_headers` text, when that file has no rule for the
 * variants, which a static host would otherwise serve uncached.
 */
export const materialize = async (options: {
  readonly pages: ReadonlyArray<{ readonly html: string }>
  readonly fetch: (request: Request) => Promise<Response>
  /** The most files to write. */
  readonly maxFiles?: number
  /** The site's `_headers` text, to check it has `headersRule()`'s pattern. */
  readonly headersFile?: string
  /** Variants made at once. */
  readonly concurrency?: number
}): Promise<ReadonlyArray<Materialized>> => {
  const paths = [
    ...new Set(options.pages.flatMap(page => page.html.match(VARIANT_PATH) ?? [])),
  ].sort()
  const maxFiles = nonNegativeInteger('maxFiles', options.maxFiles ?? DEFAULT_MAX_FILES)
  const concurrency = positiveInteger(
    'foldkit-media: materialize concurrency',
    options.concurrency ?? 4,
  )
  if (paths.length > maxFiles) {
    throw new Error(
      `foldkit-media: the pages name ${paths.length} variants, more than maxFiles (${maxFiles})`,
    )
  }
  if (
    paths.length > 0 &&
    options.headersFile !== undefined &&
    !options.headersFile.split(/\r?\n/).some(line => line.trim() === PATTERN)
  ) {
    throw new Error(
      `foldkit-media: _headers has no ${PATTERN} rule, so the variants would be served uncached: add Media.headersRule()`,
    )
  }
  const made: Array<Materialized> = []
  const failed: Array<string> = []
  const queue = [...paths]
  const worker = async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      try {
        const response = await options.fetch(new Request(`http://materialize.invalid${path}`))
        if (response.status !== 200) {
          failed.push(`${path}: ${response.status}`)
          continue
        }
        made.push({ file: path.slice(1), contents: new Uint8Array(await response.arrayBuffer()) })
      } catch (cause) {
        failed.push(`${path}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  if (failed.length > 0) {
    throw new Error(
      `foldkit-media: ${failed.length} variants could not be made:\n${failed.sort().join('\n')}`,
    )
  }
  return made.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}
