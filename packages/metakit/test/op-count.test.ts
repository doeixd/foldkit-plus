import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coreOps } from '../src/ops/table.js'

const operatorCount = Object.keys(coreOps).length

describe('core operator count', () => {
  it('has 50 operator descriptors', () => {
    expect(operatorCount).toBe(50)
  })

  it.each([
    '../src/node.ts',
    '../src/index.ts',
    '../README.md',
    '../docs/semantics.md',
    '../../../skills/foldkit-plus/references/metakit.md',
  ])('keeps every operator count in %s consistent with coreOps', path => {
    const document = readFileSync(new URL(path, import.meta.url), 'utf8')
    const counts = [
      ...document.matchAll(/\b(\d+)(?: primitive operators|-op core| operators| core operators)\b/g),
    ]

    expect(counts.length).toBeGreaterThan(0)
    for (const [, count] of counts) expect(Number(count)).toBe(operatorCount)
  })
})
