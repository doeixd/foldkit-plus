/**
 * The icons plugin in a real `vite build`, over a root of its own holding an
 * Iconify package and a folder of SVG files: what an entry imports is in the
 * bundle and nothing else is, the declaration it writes names every icon and
 * type-checks, and a refused icon fails where it is used.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createServer } from 'vite'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { exportName, icons, type IconsOptions } from 'foldkit-media/vite'

const roots: Array<string> = []
afterAll(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })))

const iconifySet = {
  prefix: 'test',
  width: 24,
  height: 24,
  icons: {
    'arrow-left': { body: '<path d="M1 1"/>' },
    unused: { body: '<path d="M9 9"/>' },
    import: { body: '<path d="M2 2"/>' },
    spinner: { body: '<circle r="1"><animate attributeName="r"/></circle>' },
  },
  aliases: { back: { parent: 'arrow-left' } },
}

/** A root with the set installed, the given SVGs in `icons/`, and an entry of `source`. */
const rootWith = (source: string, svgs: Readonly<Record<string, string>> = {}): string => {
  const root = mkdtempSync(join(tmpdir(), 'foldkit-icons-'))
  roots.push(root)
  const set = join(root, 'node_modules', '@iconify-json', 'test')
  mkdirSync(set, { recursive: true })
  writeFileSync(join(set, 'package.json'), JSON.stringify({ name: '@iconify-json/test' }))
  writeFileSync(join(set, 'icons.json'), JSON.stringify(iconifySet))
  mkdirSync(join(root, 'icons'))
  for (const [file, svg] of Object.entries(svgs)) writeFileSync(join(root, 'icons', file), svg)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }))
  writeFileSync(join(root, 'main.js'), source)
  return root
}

const bundle = async (root: string, options: IconsOptions): Promise<string> => {
  const built = await build({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [icons(options)],
    build: { lib: { entry: 'main.js', formats: ['es'] }, write: false, minify: false },
  })
  return (Array.isArray(built) ? built : [built])
    .flatMap(result => ('output' in result ? result.output : []))
    .map(chunk => (chunk.type === 'chunk' ? chunk.code : ''))
    .join('\n')
}

const both: IconsOptions = { iconify: ['test'], folders: { app: './icons' } }
const logo = '<svg viewBox="0 0 10 10"><path d="M5 5"/></svg>'

describe('icons', () => {
  it('bundles what the entry imports, from a set and a folder, and nothing else', async () => {
    const root = rootWith(
      `import { arrowLeft, back, import as importIcon } from 'virtual:foldkit-icons/test'
import { logo } from 'virtual:foldkit-icons/app'
export const used = [arrowLeft, back, importIcon, logo]`,
      {
        'logo.svg': logo,
        'star-filled.svg': '<svg viewBox="0 0 1 1"><path d="M7 7"/></svg>',
        'README.txt': 'Not an icon.',
      },
    )
    const code = await bundle(root, { ...both, dts: false })
    expect(existsSync(join(root, 'foldkit-icons.d.ts'))).toBe(false)
    for (const drawn of ['M1 1', 'M2 2', 'M5 5']) expect(code).toContain(drawn)
    for (const left of ['M9 9', 'M7 7']) expect(code).not.toContain(left)
  }, 60_000)

  it('writes a declaration that names every icon, says why one is left out, and type-checks', async () => {
    const root = rootWith(`import { logo } from 'virtual:foldkit-icons/app'\nexport { logo }`, {
      'logo.svg': logo,
    })
    await bundle(root, both)
    const written = statSync(join(root, 'foldkit-icons.d.ts')).mtimeMs
    await bundle(root, both)
    expect(statSync(join(root, 'foldkit-icons.d.ts')).mtimeMs).toBe(written)
    const declaration = readFileSync(join(root, 'foldkit-icons.d.ts'), 'utf8')
    expect(declaration).toMatch(/declare module 'virtual:foldkit-icons\/test'/)
    expect(declaration).toMatch(/i\d+ as arrowLeft/)
    expect(declaration).toMatch(/i\d+ as import\b/)
    expect(declaration).toMatch(/Left out, spinner: .*<animate>/)
    expect(declaration).not.toMatch(/as spinner/)

    const here = dirname(fileURLToPath(import.meta.url))
    const media = resolve(here, '..')
    writeFileSync(
      join(root, 'use.ts'),
      `import type { IconData } from 'foldkit-media'
import { arrowLeft, import as importIcon } from 'virtual:foldkit-icons/test'
import { logo } from 'virtual:foldkit-icons/app'
export const used: ReadonlyArray<IconData> = [arrowLeft, importIcon, logo]
// @ts-expect-error an icon is IconData, not anything
export const wrong: number = arrowLeft
// @ts-expect-error a name the set does not have
export { arow } from 'virtual:foldkit-icons/test'
// @ts-expect-error an icon the parser refused
export { spinner } from 'virtual:foldkit-icons/test'
`,
    )
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'nodenext',
          types: [],
          skipLibCheck: true,
          paths: { 'foldkit-media': [join(media, 'src', 'index.ts')] },
        },
        files: ['use.ts', 'foldkit-icons.d.ts'],
      }),
    )
    const tsc = resolve(media, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc')
    expect(() =>
      execFileSync(process.execPath, [tsc, '-p', root], { encoding: 'utf8', stdio: 'pipe' }),
    ).not.toThrow()
  }, 120_000)

  it('fails the build on an import of an icon the set left out', async () => {
    const root = rootWith(`export { spinner } from 'virtual:foldkit-icons/test'`)
    await expect(bundle(root, { iconify: ['test'] })).rejects.toThrow(/spinner/)
  }, 60_000)

  it.each([
    [
      'an SVG the parser refuses, naming its file',
      { 'bad.svg': '<svg viewBox="0 0 1 1"><script/></svg>' },
      /icons[\\/]bad\.svg.*<script>/,
    ],
    [
      'two files imported by one name',
      { 'a-b.svg': logo, 'a_b.svg': logo },
      /"app:a-b" and "app:a_b" would both be imported as aB/,
    ],
  ])(
    'fails the build on %s',
    async (_, svgs, reason) => {
      const root = rootWith(`export { logo } from 'virtual:foldkit-icons/app'`, svgs)
      await expect(bundle(root, { folders: { app: './icons' } })).rejects.toThrow(reason)
    },
    60_000,
  )

  it('fails the build on a set it was not given, and on a set not installed', async () => {
    const root = rootWith(`export { x } from 'virtual:foldkit-icons/other'`)
    await expect(bundle(root, both)).rejects.toThrow(
      /no icon set "other"; the sets given are test, app/,
    )
    await expect(bundle(root, { iconify: ['missing'] })).rejects.toThrow(
      /add @iconify-json\/missing/,
    )
  }, 60_000)

  it('fails the build on a set file that is not an Iconify set, naming it', async () => {
    const root = rootWith(`export { back } from 'virtual:foldkit-icons/test'`)
    writeFileSync(
      join(root, 'node_modules', '@iconify-json', 'test', 'icons.json'),
      JSON.stringify({ prefix: 'test', icons: { back: { body: 1 } } }),
    )
    await expect(bundle(root, { iconify: ['test'] })).rejects.toThrow(
      /icons\.json is not an Iconify set/,
    )
  }, 60_000)

  it('serves a file added to a folder while the dev server runs, and declares it', async () => {
    const root = rootWith('', { 'logo.svg': logo })
    const server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [icons({ folders: { app: './icons' } })],
      server: { middlewareMode: true, ws: false },
    })
    try {
      expect(Object.keys(await server.ssrLoadModule('virtual:foldkit-icons/app'))).toEqual(['logo'])
      writeFileSync(join(root, 'icons', 'added.svg'), logo)
      await vi.waitFor(
        async () => {
          const names = Object.keys(await server.ssrLoadModule('virtual:foldkit-icons/app'))
          expect(names.sort()).toEqual(['added', 'logo'])
        },
        { timeout: 10_000, interval: 100 },
      )
      expect(readFileSync(join(root, 'foldkit-icons.d.ts'), 'utf8')).toMatch(/i\d+ as added/)

      // A refused file is the set's error, not the server's end: removed, the set loads again.
      writeFileSync(join(root, 'icons', 'bad.svg'), '<svg viewBox="0 0 1 1"><script/></svg>')
      await vi.waitFor(
        () => expect(server.ssrLoadModule('virtual:foldkit-icons/app')).rejects.toThrow(/bad\.svg/),
        { timeout: 10_000, interval: 100 },
      )
      rmSync(join(root, 'icons', 'bad.svg'))
      await vi.waitFor(
        async () => {
          const names = Object.keys(await server.ssrLoadModule('virtual:foldkit-icons/app'))
          expect(names.sort()).toEqual(['added', 'logo'])
        },
        { timeout: 10_000, interval: 100 },
      )
    } finally {
      await server.close()
    }
  }, 60_000)

  it.each([
    ['a name with capitals', { iconify: ['Lucide'] }],
    ['one set given twice', { iconify: ['app'], folders: { app: './icons' } }],
  ])('refuses %s', (_, options) => {
    expect(() => icons(options)).toThrow(/foldkit-media\/vite/)
  })
})

describe('exportName', () => {
  it.each([
    ['arrow-left', 'arrowLeft'],
    ['chevron_down', 'chevronDown'],
    ['1-circle', '_1Circle'],
    ['import', 'import'],
  ])('imports %s as %s', (name, exported) => {
    expect(exportName(name)).toBe(exported)
  })
})
