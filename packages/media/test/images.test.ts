/**
 * The images plugin in a real `vite build` and a real development server, over
 * a root of its own holding one photograph: the import is the picture's facts
 * and a provider whose every URL is a file the build wrote, at the width it
 * names; the variants are kept by content between builds; and the development
 * server makes the same variants when asked.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Option } from 'effect'
import sharp from 'sharp'
import { build, createServer } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { Layout, Picture, type ImageAsset, type Provider } from 'foldkit-media'
import { images, type ImagesOptions } from 'foldkit-media/vite'

const roots: Array<string> = []
afterAll(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })))

const photo = () =>
  sharp({ create: { width: 1000, height: 500, channels: 3, background: '#2a6f97' } })
    .composite([
      {
        input: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><circle cx="300" cy="250" r="200" fill="#f4a261"/></svg>',
        ),
      },
    ])
    .jpeg()
    .toBuffer()

// Inside the package (and ignored by git), so the bundle's `effect` and `foldkit-media` are the test's.
const scratch = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.tmp')

const rootWith = async (source: string): Promise<string> => {
  mkdirSync(scratch, { recursive: true })
  const root = mkdtempSync(join(scratch, 'images-'))
  roots.push(root)
  writeFileSync(join(root, 'hero.jpg'), await photo())
  writeFileSync(join(root, 'main.js'), source)
  return root
}

const options: ImagesOptions = { sources: ['avif'], fallback: 'webp' }

const buildIn = (root: string, chosen: ImagesOptions = options) =>
  build({
    configFile: false,
    root,
    logLevel: 'silent',
    cacheDir: join(root, '.vite'),
    plugins: [images(chosen)],
    build: {
      outDir: 'out',
      emptyOutDir: true,
      minify: false,
      lib: { entry: 'main.js', formats: ['es'], fileName: () => 'main.js' },
      rolldownOptions: { external: ['effect', 'foldkit-media'] },
    },
  })

const emitted = (root: string) =>
  readdirSync(join(root, 'out')).filter(file => !file.endsWith('.js'))

describe('images', () => {
  it('imports the facts and a provider whose every URL is a file it wrote, at that width', async () => {
    const root = await rootWith(`export { default } from './hero.jpg?image'`)
    await buildIn(root)
    const { default: image } = (await import(pathToFileURL(join(root, 'out', 'main.js')).href)) as {
      default: { asset: ImageAsset; provider: Provider.Provider }
    }
    expect([image.asset.key, image.asset.width, image.asset.height, image.asset.alpha]).toEqual([
      'hero.jpg',
      1000,
      500,
      false,
    ])
    expect(Option.isSome(image.asset.hash)).toBe(true)
    expect(Option.isSome(image.asset.placeholder)).toBe(true)

    // The ladder's widths below the original's, then its own, in each format.
    // (The bundler merges files of equal bytes, so a width made wider than the
    // original shows only in what the provider offers.)
    expect(image.provider.widths.values).toEqual([320, 480, 640, 828, 1000])
    const files = emitted(root)
    expect(files).toHaveLength(10)
    for (const width of [320, 480, 640, 828, 1000]) {
      for (const format of ['avif', 'webp']) {
        const file = files.find(name => name.startsWith(`hero-${width}-`) && name.endsWith(format))
        if (file === undefined) expect.unreachable(`missing ${width}.${format}`)
        const [, namedHash] = /-([0-9a-f]{64})\.[^.]+$/.exec(file) ?? []
        expect(namedHash).toBe(
          createHash('sha256')
            .update(readFileSync(join(root, 'out', file)))
            .digest('hex'),
        )
      }
    }
    const picture = Option.getOrThrow(
      Picture.derive({ asset: image.asset, provider: image.provider, layout: Layout.FullWidth() }),
    )
    const urls = picture.img.srcset.split(', ').map((candidate: string) => candidate.split(' '))
    expect(urls.length).toBe(5)
    for (const [url, descriptor] of urls) {
      const bytes = readFileSync(join(root, 'out', url!.replace(/^\//, '')))
      const { width, format } = await sharp(bytes).metadata()
      expect([`${width}w`, format]).toEqual([descriptor, 'webp'])
    }
  }, 120_000)

  it('keeps each variant by the original’s content, so a second build makes none again', async () => {
    const root = await rootWith(`export { default } from './hero.jpg?image'`)
    await buildIn(root)
    const kept = join(root, '.vite', 'foldkit-media', 'r1')
    const [hash] = readdirSync(kept)
    writeFileSync(join(kept, hash!, 'w320.webp'), 'kept')
    const facts = JSON.parse(readFileSync(join(kept, hash!, 'asset.json'), 'utf8'))
    writeFileSync(join(kept, hash!, 'asset.json'), JSON.stringify({ ...facts, alpha: true }))
    await buildIn(root)
    const keptOutput = emitted(root).find(
      file => file.startsWith('hero-320-') && file.endsWith('.webp'),
    )
    if (keptOutput === undefined) expect.unreachable('missing kept 320.webp')
    expect(readFileSync(join(root, 'out', keptOutput), 'utf8')).toBe('kept')
    const { default: image } = (await import(pathToFileURL(join(root, 'out', 'main.js')).href)) as {
      default: { asset: ImageAsset }
    }
    expect(image.asset.alpha).toBe(true)
  }, 120_000)

  it('serves the same variants from the development server, and nothing it did not offer', async () => {
    const root = await rootWith('')
    const server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      cacheDir: join(root, '.vite'),
      plugins: [images(options)],
      server: { port: 0 },
    })
    await server.listen()
    try {
      const { default: image } = (await server.ssrLoadModule('/hero.jpg?image')) as {
        default: { asset: ImageAsset; provider: Provider.Provider }
      }
      const url = Option.getOrThrow(
        image.provider.url(image.asset, { width: 640, encoding: 'avif' }),
      )
      const origin = server.resolvedUrls!.local[0]!.replace(/\/$/, '')
      const answer = await fetch(`${origin}${url}`)
      expect(['content-type', 'cache-control'].map(name => answer.headers.get(name))).toEqual([
        'image/avif',
        'public, max-age=31536000, immutable',
      ])
      const { width, format } = await sharp(new Uint8Array(await answer.arrayBuffer())).metadata()
      expect([width, format]).toEqual([640, 'heif'])

      for (const unoffered of [url.replace('w640', 'w700'), url.replace('.avif', '.png')]) {
        expect((await fetch(`${origin}${unoffered}`)).status).toBe(404)
      }
    } finally {
      await server.close()
    }
  }, 120_000)

  it('writes one file for a format that is both a source and the fallback', async () => {
    const root = await rootWith(`export { default } from './hero.jpg?image'`)
    await buildIn(root, { sources: ['webp'], fallback: 'webp' })
    expect(emitted(root).filter(file => file.startsWith('hero-320-'))).toHaveLength(1)
    // The module is what refuses two files for one variant, when it runs.
    const { default: image } = (await import(pathToFileURL(join(root, 'out', 'main.js')).href)) as {
      default: { provider: Provider.Provider }
    }
    expect(image.provider.sources).toEqual(['webp'])
  }, 120_000)

  it.each([0, 101, 7.5])('refuses a quality of %s', quality => {
    expect(() => images({ quality })).toThrow(/quality is a whole number from 1 to 100/)
  })
})
