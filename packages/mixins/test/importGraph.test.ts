/**
 * The Style kernel and the subpath modules built on it never import the
 * slot side of the package, so they can lift into their own package by
 * moving files. `style.ts` is the one module that joins the two.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

const kernelAndSubpaths = [
  'styleValue.ts',
  'styleRules.ts',
  'theme.ts',
  'theme/core.ts',
  'theme/root.ts',
  'theme/tokens.ts',
  'theme/oklch.ts',
  'layers.ts',
  'layout.ts',
  'defaults.ts',
  'prose.ts',
]

const slotSide = [
  'slot.js',
  'slots.js',
  'contribution.js',
  'resolver.js',
  'slotView.js',
  'behavior.js',
  'mixin.js',
  'style.js',
]

const importsOf = (file: string): ReadonlyArray<string> =>
  [...readFileSync(join(src, file), 'utf8').matchAll(/from '(?:\.\.?\/)+([^']+)'/g)].map(
    match => match[1] ?? '',
  )

describe('import graph', () => {
  it.each(kernelAndSubpaths)('%s does not import the slot side', file => {
    const offending = importsOf(file).filter(target => slotSide.includes(target))
    expect(offending).toEqual([])
  })
})
