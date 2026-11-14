/**
 * The README's excerpts are claims a reader copies: each block whose first line
 * names a file under `examples/authoring` is lines of that file, in order.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../../', import.meta.url)
const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

const excerpts = Array.from(
  README.matchAll(/```ts\n\/\/ (examples\/authoring\/[^\n]+)\n([\s\S]*?)```/g),
).map(([, file, body]) => ({ file: file!, body: body!.trimEnd() }))

describe('the README excerpts', () => {
  it('has some, so the check below is not vacuous', () => {
    expect(excerpts.length).toBeGreaterThanOrEqual(4)
  })

  it.each(excerpts.map(excerpt => [excerpt.file, excerpt] as const))(
    '%s holds its excerpt verbatim',
    (_file, { file, body }) => {
      expect(readFileSync(new URL(file, root), 'utf8')).toContain(body)
    },
  )
})
