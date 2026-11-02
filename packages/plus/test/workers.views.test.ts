// @vitest-environment node
/**
 * The Worker's views carry the identities the page's Vite build gives them
 * (#412): each function's result is named by its module's path from the
 * page's root, a module a plugin loads included, and `foldkit/brand` comes
 * from where the page has Foldkit. Without it Foldkit rebuilds every page
 * the Worker served (`examples/reference/e2e` shows that end to end).
 */
import type { Plugin } from 'esbuild'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { Stack } from '../src/testing/workers.js'

const supported = String(
  createRequire(createRequire(import.meta.url).resolve('wrangler'))('miniflare')
    .supportedCompatibilityDate,
)

/** The folder of the `foldkit` this package depends on. */
const foldkit = await realpath(join(import.meta.dirname, '..', 'node_modules', 'foldkit'))

const vnode = (text: string) =>
  `({ sel: 'p', data: {}, children: [], text: ${text}, elm: undefined, key: undefined })`

const directories: Array<string> = []

afterAll(async () => {
  for (const directory of directories) await rm(directory, { recursive: true, force: true })
})

const folder = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'foldkit-plus-views-'))
  directories.push(directory)
  return directory
}

/** A folder with Foldkit installed, as a page's root has. */
const withFoldkit = async () => {
  const directory = await folder()
  await mkdir(join(directory, 'node_modules'))
  await symlink(foldkit, join(directory, 'node_modules', 'foldkit'), 'junction')
  return directory
}

/** A Worker in `directory`, its entry and a module it imports under `src`. */
const worker = async (directory: string) => {
  await writeFile(
    join(directory, 'wrangler.toml'),
    `name = "views"\nmain = "dist/worker.js"\nno_bundle = true\ncompatibility_date = "${supported}"\n`,
  )
  await mkdir(join(directory, 'src'))
  await writeFile(
    join(directory, 'src', 'worker.ts'),
    `export { card } from './card.js'\n` +
      `export const view = (text: string) => ${vnode('text')}\n` +
      `export default { fetch: () => new Response('ok') }\n`,
  )
  await writeFile(
    join(directory, 'src', 'card.ts'),
    `export const card = () => ${vnode("'card'")}\n`,
  )
  return { wrangler: join(directory, 'wrangler.toml'), entry: join(directory, 'src', 'worker.ts') }
}

interface Bundle {
  readonly view: (text: string) => { readonly identity?: string; readonly text: string }
  readonly card: () => { readonly identity?: string; readonly text: string }
}

const bundled = async (directory: string): Promise<Bundle> =>
  import(/* @vite-ignore */ pathToFileURL(join(directory, 'dist', 'worker.js')).href)

/** Loads `card.ts` itself, as `pnpm mutate`'s plugin does, with an edit. */
const editing: Plugin = {
  name: 'editing',
  setup: build =>
    build.onLoad({ filter: /card\.ts$/ }, () => ({
      contents: `export const card = () => ${vnode("'edited'")}\n`,
      loader: 'ts',
    })),
}

describe("the Worker's views", () => {
  it("are named from the configuration's folder, a module a plugin loads included", async () => {
    const directory = await withFoldkit()
    await Stack.writeBundle({ ...(await worker(directory)), plugins: [editing] })
    const { view, card } = await bundled(directory)
    expect(view('one').identity).toBe('src/worker.ts#view')
    expect(card()).toMatchObject({ identity: 'src/card.ts#card', text: 'edited' })
  })

  it('are named from the page root given, with the Foldkit installed there', async () => {
    const directory = await folder()
    const page = await withFoldkit()
    await Stack.writeBundle({ ...(await worker(directory)), pageRoot: page })
    const path = relative(page, join(directory, 'src', 'worker.ts'))
      .split(sep)
      .join('/')
    expect((await bundled(directory)).view('one').identity).toBe(`${path}#view`)
  })

  it('are left as written where the page root has no Foldkit', async () => {
    const directory = await folder()
    await Stack.writeBundle(await worker(directory))
    const { view } = await bundled(directory)
    expect(view('one')).toMatchObject({ text: 'one' })
    expect(view('one').identity).toBeUndefined()
  })
})
