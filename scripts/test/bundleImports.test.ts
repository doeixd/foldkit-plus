// @vitest-environment node
/**
 * Rolldown writes a module's imports in the order it finished reading them, so a `dist` rebuilt
 * from one source differs, and so did the bundle size read from it. The report sorts the leading
 * imports of each file it builds.
 */
import { expect, test } from 'vitest'
import { sortLeadingImports } from '../bundle-report.mjs'

test('sorts the leading imports and exports, and nothing after them', () => {
  const text = [
    'export * from "./b.js";',
    'import { z } from "../a.js";',
    'export * from "./a.js";',
    '// src/x.ts',
    'import { late } from "./late.js";',
    'export const x = 1;',
  ].join('\n')
  expect(sortLeadingImports(text)).toBe(
    [
      'export * from "./a.js";',
      'export * from "./b.js";',
      'import { z } from "../a.js";',
      '// src/x.ts',
      'import { late } from "./late.js";',
      'export const x = 1;',
    ].join('\n'),
  )
})

test('two orders of the same imports give one text', () => {
  const lines = [
    'import { a } from "./a.js";',
    'import { b } from "./b.js";',
    'export const x = 1;',
  ]
  const [first = '', second = '', rest = ''] = lines
  expect(sortLeadingImports([second, first, rest].join('\n'))).toBe(
    sortLeadingImports([first, second, rest].join('\n')),
  )
})

test('a file with no leading imports is unchanged', () => {
  const text = '// header\nexport const x = 1;\n'
  expect(sortLeadingImports(text)).toBe(text)
})
