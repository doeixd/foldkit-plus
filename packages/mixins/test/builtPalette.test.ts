/**
 * The palette survives a production build. Vite lowers a page's CSS for the
 * build's targets with Lightning CSS: `light-dark()` becomes a pair of
 * variable toggles, and a color literal gains fallbacks in older syntaxes.
 * A fallback worked out at build time from a grey, whose hue is powerless,
 * could bake a hue no knob named into every page. So the shipped theme's
 * foundations are built as a demo builds them, and the built sheet must
 * still derive every palette color in the browser, and hold no literal
 * color with any chroma.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { stylesheet } from './fixtures/built-palette/sheet.js'
import { palette } from '../src/theme/oklch.js'

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'built-palette')
const outDir = mkdtempSync(join(tmpdir(), 'foldkit-built-palette-'))

let built = ''

beforeAll(async () => {
  const { build } = await import('vite')
  await build({
    configFile: false,
    root,
    logLevel: 'error',
    plugins: [
      // As `foldkit-mixins/foundations` writes it: a head style the build then
      // lowers. The sheet is the one this test imported, so a mutation reaches it.
      {
        name: 'built-palette-sheet',
        transformIndexHtml: {
          order: 'pre',
          handler: () => [{ tag: 'style', children: stylesheet, injectTo: 'head' }],
        },
      },
    ],
    // The demos' target, which lowers `light-dark()` and color syntax.
    build: { target: 'es2022', outDir, emptyOutDir: true },
  })
  const page = readFileSync(join(outDir, 'index.html'), 'utf8')
  built = Array.from(page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g), match => match[1]).join('')
}, 120_000)

afterAll(() => rmSync(outDir, { recursive: true, force: true }))

/** The palette's color tokens, by the custom property each is declared as. */
const colors = Object.entries(palette)
  .filter(([group]) => !['knob', 'hue', 'gamut'].includes(group))
  .flatMap(([group, names]) =>
    Object.keys(names)
      .filter(name => !(group === 'popup' && name === 'blur'))
      .map(name => `--fk-${group}-${name}`),
  )

it('lowers the sheet, as a build for the demos’ target does', () => {
  // Without the lowering this test would check nothing a build changes.
  expect(stylesheet).toContain('light-dark(')
  expect(built).not.toContain('light-dark(')
  expect(built).toContain('--lightningcss-light')
})

it('leaves every palette color for the browser to derive', () => {
  const baked = colors.flatMap(property =>
    Array.from(built.matchAll(new RegExp(`${property}:([^;}]*)`, 'g')), match => match[1] ?? '')
      .filter(value => !value.includes('var(--fk-'))
      .map(value => `${property}: ${value}`),
  )
  expect(colors.length).toBeGreaterThan(100)
  expect(baked).toEqual([])
})

/**
 * Each literal color in `css` that is not a grey: its channels apart by more
 * than an 8-bit step, in the scale of its own syntax.
 */
const chromatic = (css: string): ReadonlyArray<string> => {
  const spread = (values: ReadonlyArray<number>) => Math.max(...values) - Math.min(...values)
  return [
    ...Array.from(
      css.matchAll(/\blab\(\s*[\d.]+%?\s+(-?[\d.]+)\s+(-?[\d.]+)/g),
      ([color, a = '', b = '']) => [color, Math.hypot(+a, +b) > 1] as const,
    ),
    ...Array.from(
      css.matchAll(/\boklab\(\s*[\d.]+%?\s+(-?[\d.]+)\s+(-?[\d.]+)/g),
      ([color, a = '', b = '']) => [color, Math.hypot(+a, +b) > 0.004] as const,
    ),
    ...Array.from(
      css.matchAll(/\b(ok)?lch\(\s*[\d.]+%?\s+([\d.]+)\s+[\d.]+/g),
      ([color, ok, c = '']) => [color, +c > (ok ? 0.004 : 1)] as const,
    ),
    ...Array.from(
      css.matchAll(/\brgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g),
      ([color, r = '', g = '', b = '']) => [color, spread([+r, +g, +b]) > 2] as const,
    ),
    ...Array.from(css.matchAll(/#([\da-f]{3,8})\b/gi), ([color, hex = '']) => {
      const pairs =
        hex.length <= 4
          ? Array.from(hex.slice(0, 3), digit => digit + digit)
          : [0, 2, 4].map(at => hex.slice(at, at + 2))
      return [color, spread(pairs.map(pair => parseInt(pair, 16))) > 2] as const
    }),
  ].flatMap(([color, colored]) => (colored ? [color] : []))
}

it('bakes no literal color with chroma into the built sheet', () => {
  // The lowering does write literals: the shadow's black, in `lab()`.
  expect(built).toContain('lab(0% 0 0')
  expect(chromatic(built)).toEqual([])
})
