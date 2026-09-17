import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { generate, transformSourceFile } from '../src/index.js'

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Decodes source map mappings into absolute [generatedColumn, sourceLine, sourceColumn] per generated line. */
const decode = (mappings: string) => {
  let sourceLine = 0
  let sourceColumn = 0
  return mappings.split(';').map(line => {
    let generatedColumn = 0
    return line
      .split(',')
      .filter(segment => segment !== '')
      .map(segment => {
        const values: Array<number> = []
        let value = 0
        let shift = 0
        for (const char of segment) {
          const digit = BASE64.indexOf(char)
          value += (digit & 31) << shift
          shift += 5
          if ((digit & 32) === 0) {
            values.push(value & 1 ? -(value >> 1) : value >> 1)
            value = 0
            shift = 0
          }
        }
        generatedColumn += values[0]!
        sourceLine += values[2] ?? 0
        sourceColumn += values[3] ?? 0
        return [generatedColumn, sourceLine, sourceColumn] as const
      })
  })
}

/** The source position of the last mapping at or before a generated position. */
const lookup = (mappings: string, line: number, column: number) => {
  const segment = decode(mappings)
    [line]!.filter(([generated]) => generated <= column)
    .at(-1)
  return segment && { line: segment[1], column: segment[2] }
}

const source = `import type { Html, HtmlBuilder } from 'foldkit/html'
export const view = (h: HtmlBuilder<never>): Html =>
  h.section([h.Class('box')], [h.p([], ['hi'])])
`

const position = (text: string, needle: string) => {
  const index = text.indexOf(needle)
  const before = text.slice(0, index).split('\n')
  return { line: before.length - 1, column: before.at(-1)!.length }
}

it('maps generated JSX back to the builder calls it came from', () => {
  const result = transformSourceFile('src/View.ts', source, { sourceMap: true })
  if (!result.ok || result.map === undefined) throw new Error('expected a map')
  const map = JSON.parse(result.map) as { mappings: string; sources: Array<string> }
  expect(map.sources).toEqual(['src/View.ts'])

  for (const [generated, original] of [
    ['<section', 'h.section('],
    ['className', "h.Class('box')"],
    ['<p>', 'h.p('],
  ] as const) {
    const at = position(result.code, generated)
    expect(lookup(map.mappings, at.line, at.column), generated).toEqual(position(source, original))
  }
})

it('produces the same code with or without a map', () => {
  const plain = transformSourceFile('src/View.ts', source)
  const withMap = transformSourceFile('src/View.ts', source, { sourceMap: true })
  expect(withMap.ok && plain.ok && withMap.code).toBe(plain.ok && plain.code)
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'foldkit-react-codegen-map-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

it('writes a map beside each output that points back to the source file', async () => {
  await mkdir(join(dir, 'src'))
  await writeFile(join(dir, 'src/View.ts'), source)
  await generate({
    inputs: [join(dir, 'src')],
    outDir: join(dir, 'out'),
    rootDir: dir,
    sourceMap: true,
  })

  const code = await readFile(join(dir, 'out/src/View.tsx'), 'utf8')
  expect(code.endsWith('//# sourceMappingURL=View.tsx.map\n')).toBe(true)
  const map = JSON.parse(await readFile(join(dir, 'out/src/View.tsx.map'), 'utf8')) as {
    file: string
    sources: Array<string>
  }
  expect(map).toMatchObject({ file: 'View.tsx', sources: ['../../src/View.ts'] })
})
