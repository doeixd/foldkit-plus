/**
 * Images as imports: `import hero from './hero.jpg?image'` gives `{ asset,
 * provider }`, ready for `Picture.derive` or `foldkit-mixins-ui`'s `Image.view`.
 * The build reads the file's facts once (`describe`, through sharp), writes a
 * file for each ladder width up to the original's own in each format, and
 * names them by content, so a host may keep them for good. The development
 * server makes the same variants when a page asks for them.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { Cause, Effect, Exit, Layer, ManagedRuntime, Option, Schema } from 'effect'
import type { Plugin } from 'vite'
import { ImageAsset } from '../asset.js'
import type { Format } from '../format.js'
import type { Variant } from '../variant.js'
import * as Widths from '../widths.js'
import { describe, type Inspector } from '../server/describe.js'
import { Transformer } from '../server/services.js'

const QUERY = 'image'
const DEV_PREFIX = '/@foldkit-media/image/'
const DEV_PATH = /^\/@foldkit-media\/image\/([0-9a-f]{64})\/w(\d+)\.(avif|webp|jpeg|png)$/

export interface ImagesOptions {
  /** The widths offered, up to each original's own: `Widths.standard` unless given. */
  readonly widths?: Widths.Widths | undefined
  /** Formats offered as `source`s, most preferred first: `['avif']` unless given. */
  readonly sources?: ReadonlyArray<Format> | undefined
  /** The `img`'s own format: `webp` unless given. */
  readonly fallback?: Format | undefined
  /** The encoder's quality, 1 to 100; its own default unless given. */
  readonly quality?: number | undefined
}

type Media = ManagedRuntime.ManagedRuntime<Inspector | Transformer, never>

/** The widths a build writes of an original: the ladder's below its own, then its own. */
const widthsFor = (ladder: Widths.Widths, width: number): ReadonlyArray<number> => [
  ...ladder.values.filter(value => value < width),
  width,
]

const run = async <A, E>(
  media: Media,
  effect: Effect.Effect<A, E, Inspector | Transformer>,
  what: string,
) => {
  const exit = await media.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error(`foldkit-media/vite: ${what}: ${Cause.pretty(exit.cause)}`)
}

/**
 * The plugin: an import with `?image` becomes the image's facts and a
 * provider over its variants. sharp is read on the first such import, so an
 * application that imports none needs no sharp.
 */
export const images = (options: ImagesOptions = {}): Plugin => {
  const ladder = options.widths ?? Widths.standard
  const sources = options.sources ?? ['avif']
  const fallback = options.fallback ?? 'webp'
  const formats = [...new Set([...sources, fallback])]
  const quality = Option.fromNullishOr(options.quality)
  if (
    Option.isSome(quality) &&
    !(Number.isInteger(quality.value) && quality.value >= 1 && quality.value <= 100)
  ) {
    throw new Error(
      `foldkit-media/vite: a quality is a whole number from 1 to 100, not ${quality.value}.`,
    )
  }

  let root = process.cwd()
  let cache = join(root, 'node_modules', '.vite', 'foldkit-media')
  let serving = false
  /** The originals the development server has been asked to vary, by content hash. */
  const originals = new Map<
    string,
    { readonly bytes: Uint8Array<ArrayBuffer>; readonly widths: ReadonlyArray<number> }
  >()

  let media: Promise<Media> | undefined
  const mediaOf = () =>
    (media ??= import('../sharp/index.js').then(
      ({ inspectorSharp, transformerSharp }) =>
        ManagedRuntime.make(Layer.mergeAll(inspectorSharp(), transformerSharp())),
      cause => {
        throw new Error(
          `foldkit-media/vite: a ?image import needs sharp; add it to the application. (${String(cause)})`,
        )
      },
    ))

  const factsOf = async (
    key: string,
    bytes: Uint8Array<ArrayBuffer>,
    hash: string,
  ): Promise<ImageAsset> => {
    const file = join(cache, hash, 'asset.json')
    try {
      return Schema.decodeUnknownSync(ImageAsset)({
        ...JSON.parse(await readFile(file, 'utf8')),
        key,
      })
    } catch {
      // Not kept yet, or kept by an older version: the facts are made again, as a cache's are.
      const asset = await run(await mediaOf(), describe(key, bytes), `${key} could not be read`)
      await mkdir(join(cache, hash), { recursive: true })
      await writeFile(file, JSON.stringify(Schema.encodeSync(ImageAsset)(asset)))
      return asset
    }
  }

  const variantOf = async (
    key: string,
    bytes: Uint8Array<ArrayBuffer>,
    hash: string,
    width: number,
    format: Format,
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const name = `w${width}${Option.match(quality, { onNone: () => '', onSome: q => `q${q}` })}.${format}`
    const file = join(cache, hash, name)
    try {
      return new Uint8Array(await readFile(file))
    } catch {
      // Not kept yet: made, and kept for the next build.
      const variant: Variant = { width, format, quality }
      const made = await run(
        await mediaOf(),
        Transformer.use(transformer =>
          transformer.transform(
            { body: new Blob([bytes]).stream(), size: bytes.byteLength },
            variant,
          ),
        ),
        `${key} could not be made ${width} wide in ${format}`,
      )
      await mkdir(join(cache, hash), { recursive: true })
      await writeFile(file, made.bytes)
      return made.bytes
    }
  }

  return {
    name: 'foldkit-media:images',
    // Before Vite's own asset handling, which takes a `.jpg` import of any query as a URL.
    enforce: 'pre',
    configResolved(config) {
      root = config.root
      cache = join(config.cacheDir, 'foldkit-media')
      serving = config.command === 'serve'
    },
    async load(id) {
      const [file, query] = id.split('?')
      if (query === undefined || !new URLSearchParams(query).has(QUERY)) return undefined
      const bytes = new Uint8Array(await readFile(file!))
      const hash = createHash('sha256').update(bytes).digest('hex')
      const key = relative(root, file!).split(sep).join('/')
      const asset = await factsOf(key, bytes, hash)
      const widths = widthsFor(ladder, asset.width)
      const files: Array<string> = []
      if (serving) originals.set(hash, { bytes, widths })
      for (const width of widths) {
        for (const format of formats) {
          const url = serving
            ? JSON.stringify(`${DEV_PREFIX}${hash}/w${width}.${format}`)
            : `import.meta.ROLLUP_FILE_URL_${this.emitFile({
                type: 'asset',
                name: `${key
                  .split('/')
                  .pop()!
                  .replace(/\.[^.]+$/, '')}-${width}.${format}`,
                source: await variantOf(key, bytes, hash, width, format),
              })}`
          files.push(`{ width: ${width}, format: ${JSON.stringify(format)}, url: ${url} }`)
        }
      }
      return [
        `import { Schema } from 'effect'`,
        `import { ImageAsset, Provider } from 'foldkit-media'`,
        `export default {`,
        `  asset: Schema.decodeUnknownSync(ImageAsset)(${JSON.stringify(Schema.encodeSync(ImageAsset)(asset))}),`,
        `  provider: Provider.fromFiles([${files.join(', ')}], ${JSON.stringify({ sources, fallback })}),`,
        `}`,
      ].join('\n')
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = DEV_PATH.exec(request.url?.split('?')[0] ?? '')
        if (match === null) return next()
        const [, hash, width, asked] = match
        const original = originals.get(hash!)
        const format = formats.find(offered => offered === asked)
        if (
          original === undefined ||
          format === undefined ||
          !original.widths.includes(Number(width))
        ) {
          response.statusCode = 404
          return response.end()
        }
        variantOf(hash!, original.bytes, hash!, Number(width), format).then(bytes => {
          response.setHeader('Content-Type', `image/${format}`)
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          response.end(bytes)
        }, next)
      })
    },
  }
}
