/**
 * Writes `src/themeData.ts`: what the page's theme panel reads from the
 * knobs and themes, as data. The browser build loads no style compiler
 * (`vite.config.ts`'s `modules`), and `Themes.make` and the token scales are
 * compiler-side, so the themes' names and values and the token scales are read
 * here, once, from the same objects the sheet is built from. The knobs' ranges
 * come from `foldkit-mixins/theme/knob-data` in the page itself.
 *
 *   pnpm --filter foldkit-example-design-system theme-data
 *
 * `test/themeData.test.ts` fails when the file differs from `generate()`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { format } from 'oxfmt'
import { Knobs } from '../../../packages/mixins/src/theme.ts'
import { app, themes } from '../src/appStyle.ts'

/** The knobs the panel moves, by the name its Messages use; their ranges are `knob-data`'s. */
const tweaks = {
  hue: 'accent.hue',
  density: 'shape.density',
  radius: 'shape.radius',
  text: 'type.scale',
  motion: 'motion.scale',
  shadow: 'shadow.strength',
}

const fail = message => {
  throw new Error(`theme-data: ${message}`)
}

const tokenGroup = group =>
  Object.entries(app.theme[group]).map(([name, value]) => [name, String(value)])

export const generate = async () => {
  const values = Object.fromEntries(
    themes.names.map(theme => [
      theme,
      Object.fromEntries(
        Object.entries(tweaks).map(([name, path]) => [
          name,
          Knobs.valueAt(Knobs.standard, themes.theme(theme).values, path),
        ]),
      ),
    ]),
  )
  const text = [
    '// Written by `theme-data` (scripts/themeData.mjs) from the knobs and themes. Do not edit.',
    `export const themeNames = ${JSON.stringify(themes.names)} as const`,
    `export const initialTheme = ${JSON.stringify(themes.initial)} as const`,
    `export const themeAttribute = ${JSON.stringify(themes.attribute)}`,
    `export const themeValues = ${JSON.stringify(values)} as const`,
    `export const tokenGroups = ${JSON.stringify({
      space: tokenGroup('space'),
      radius: tokenGroup('radius'),
    })} as const`,
    '',
  ].join('\n')
  const root = new URL('../../../', import.meta.url)
  const { $schema: _, ...config } = JSON.parse(
    readFileSync(new URL('.oxfmtrc.jsonc', root), 'utf8'),
  )
  const formatted = await format('themeData.ts', text, config)
  if (formatted.errors.length > 0) fail(formatted.errors[0].message)
  return formatted.code
}

if (process.argv.includes('--write')) {
  writeFileSync(fileURLToPath(new URL('../src/themeData.ts', import.meta.url)), await generate())
}
