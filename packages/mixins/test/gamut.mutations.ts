/**
 * The palette's gamut mapping, broken in turn:
 * `pnpm mutate packages/mixins/test/gamut.mutations.ts`.
 */
const gamut = '../src/theme/gamut.ts'
const oklch = '../src/theme/oklch.ts'
const unit = ['packages/mixins/test/gamut.test.ts']
const browser = ['packages/mixins/test/gamut.browser.test.ts']

export default [
  {
    name: 'the cusp from the polynomial alone, without Halley’s step',
    edits: [
      {
        file: gamut,
        find: 'const s = guess - (f * f1) / (f1 * f1 - 0.5 * f * f2)',
        replace: 'const s = guess',
      },
    ],
    tests: unit,
  },
  {
    name: 'a straight line from the cusp to white, which the boundary sags under',
    edits: [
      {
        file: gamut,
        find: 'return { s, ua: atWhite - ub, ub }',
        replace: 'return { s, ua: (1 - lc) / (s * lc), ub: 0 }',
      },
    ],
    tests: unit,
  },
  {
    name: 'no curve to white: only the line from black bounds a color',
    edits: [
      {
        file: gamut,
        find: "min(c, l * ${ref('s')}, (1 - l) / max(0.001, ${ref('ua')} + ${ref('ub')} * l))",
        replace: "min(c, l * ${ref('s')})",
      },
    ],
    tests: unit,
  },
  {
    name: 'a boundary written for another hue still trusted',
    edits: [
      {
        file: gamut,
        find: '`clamp(0, (max(${expression} - ${at}, ${at} - ${expression}) - 0.001) * 100000, 1)`',
        replace: "'0'",
      },
    ],
    tests: unit,
  },
  {
    name: 'a bound for any hue that some hues cannot show',
    edits: [{ file: gamut, find: 's: 0.169, ua: 6.66', replace: 's: 0.2, ua: 6.66' }],
    tests: unit,
  },
  {
    name: 'the derived hues left out where the boundary is written',
    edits: [
      {
        file: gamut,
        find: 'for (const [name, value] of Object.entries(hue)) scope[`--fk-hue-${name}`] = value',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a wash mixed toward white and left unfitted',
    edits: [
      {
        file: oklch,
        find: "fit(`color-mix(in oklab, ${v(name, '6')} ${share}%, ${v('surface', 'base')})`, name)",
        replace: "`color-mix(in oklab, ${v(name, '6')} ${share}%, ${v('surface', 'base')})`",
      },
    ],
    tests: browser,
  },
  {
    name: 'the accent’s ink left for the browser to clip',
    edits: [
      {
        file: oklch,
        find: "fitted(hue, from(color, '0.45', 'c'), from(color, '0.8', 'c'))",
        replace: "ld(from(color, '0.45', 'c'), from(color, '0.8', 'c'))",
      },
    ],
    tests: browser,
  },
  {
    name: 'the boundary left unregistered, substituted whole into every color',
    edits: [
      {
        file: gamut,
        find: '.filter(name => registered.test(name))',
        replace: '.filter(() => false)',
      },
    ],
    tests: browser,
  },
]
