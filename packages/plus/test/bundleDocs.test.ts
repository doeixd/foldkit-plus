// @vitest-environment node
/** What the package ships beside `dist`: which guides, and the links in them. */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  guidesOf,
  pinSkill,
  publishedGuides,
  releaseTag,
  rewriteGuide,
  writeBundle,
} from '../scripts/bundleDocs.js'

const root = join(import.meta.dirname, '../../..')
const BLOB = 'https://github.com/doeixd/foldkit-plus/blob'

it('takes the release tag from the changelog heading, not from a package version', () => {
  expect(releaseTag('# Changelog\n\n## Unreleased\n\n## 0.40.0\n\n## 0.39.0\n')).toBe('v0.40.0')
  expect(releaseTag('# Changelog\n\n## Unreleased\n')).toBeUndefined()
})

it('selects the docs/ guides of the catalog, once each, and nothing else', () => {
  expect(
    guidesOf([
      { file: 'README.md' },
      { file: 'packages/remote/README.md' },
      { file: 'docs/remote.md' },
      { file: 'docs/design/plan-DESIGN.md' },
      { file: 'docs/remote.md' },
      { file: 'docs/wiring.md' },
      { file: 'docs/image.png' },
    ]),
  ).toEqual(['remote.md', 'wiring.md'])
})

describe('rewriteGuide', () => {
  const shipped = ['remote.md', 'wiring.md']
  const tag = 'v0.40.0'
  it.each([
    ['a shipped guide stays relative', '[w](wiring.md)', '[w](wiring.md)'],
    ['with ./ and an anchor', '[w](./wiring.md#seams)', '[w](wiring.md#seams)'],
    ['from a path through docs/', '[w](../docs/wiring.md)', '[w](wiring.md)'],
    [
      'a README',
      '[r](../packages/remote/README.md)',
      `[r](${BLOB}/v0.40.0/packages/remote/README.md)`,
    ],
    [
      'a source file with an anchor',
      '[s](../examples/todo/src/main.ts#L3)',
      `[s](${BLOB}/v0.40.0/examples/todo/src/main.ts#L3)`,
    ],
    [
      'a document the site does not publish',
      '[d](design/x-DESIGN.md)',
      `[d](${BLOB}/v0.40.0/docs/design/x-DESIGN.md)`,
    ],
    ['an absolute link', '[a](https://example.com/a.md)', '[a](https://example.com/a.md)'],
    ['an anchor in the page', '[h](#heading)', '[h](#heading)'],
    ['mailto', '[m](mailto:a@b.c)', '[m](mailto:a@b.c)'],
    ['a reference definition', '[r]: ../README.md', `[r]: ${BLOB}/v0.40.0/README.md`],
    [
      'two on one line',
      '[a](remote.md) and [b](../LICENSE)',
      `[a](remote.md) and [b](${BLOB}/v0.40.0/LICENSE)`,
    ],
  ])('%s', (_, text, rewritten) => {
    expect(rewriteGuide(text, shipped, tag)).toBe(rewritten)
  })

  it('leaves a link inside a code fence alone', () => {
    const text = '```md\n[a](../README.md)\n```\n[b](../README.md)'
    expect(rewriteGuide(text, shipped, tag)).toBe(
      `\`\`\`md\n[a](../README.md)\n\`\`\`\n[b](${BLOB}/v0.40.0/README.md)`,
    )
  })
})

it("pins the skill's links to main at the tag, and no others", () => {
  const repository = 'https://github.com/doeixd/foldkit-plus'
  expect(
    pinSkill(
      `[a](${BLOB}/main/docs/x.md) [t](${repository}/tree/main/examples) [o](https://github.com/other/repo/blob/main/x) [r](references/y.md)`,
      'v0.40.0',
    ),
  ).toBe(
    `[a](${BLOB}/v0.40.0/docs/x.md) [t](${repository}/tree/v0.40.0/examples) [o](https://github.com/other/repo/blob/main/x) [r](references/y.md)`,
  )
})

describe('against the repository', () => {
  const out = mkdtempSync(join(tmpdir(), 'foldkit-plus-bundle-'))
  afterAll(() => rmSync(out, { recursive: true, force: true }))

  it("ships the site's published guides, each from docs/, and none of the design notes", async () => {
    const guides = await publishedGuides(root)
    expect(guides).toContain('remote.md')
    for (const guide of guides) expect(existsSync(join(root, 'docs', guide))).toBe(true)
    await writeBundle(root, out)
    expect(readdirSync(join(out, 'guides')).sort()).toEqual([...guides].sort())
    expect(existsSync(join(out, 'skill', 'SKILL.md'))).toBe(true)
    expect(readdirSync(join(out, 'skill', 'references')).length).toBeGreaterThan(0)
    expect(existsSync(join(out, 'guides', 'design'))).toBe(false)
  }, 60_000)

  it('leaves no link in a shipped copy to a file the tarball lacks, nor to main', () => {
    const guides = readdirSync(join(out, 'guides'))
    for (const guide of guides) {
      const text = readFileSync(join(out, 'guides', guide), 'utf8')
      for (const [, target = ''] of text.matchAll(/\]\(([^)\s#:]+\.md)(?:#[^)]*)?\)/g))
        expect(guides, `${guide} links ${target}`).toContain(target)
    }
    for (const file of readdirSync(join(out, 'skill'), { recursive: true, encoding: 'utf8' }))
      if (file.endsWith('.md'))
        expect(readFileSync(join(out, 'skill', file), 'utf8')).not.toContain('/blob/main/')
  })
})
