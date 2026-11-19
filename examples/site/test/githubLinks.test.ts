/**
 * The link check's reading of GitHub links: a file on `main` is looked up in
 * the working tree, one pinned to a release tag in that tag's tree.
 */
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { GITHUB } from '../src/content/guides.js'
import { brokenGithubLink } from './githubLinks.js'

const repository = join(import.meta.dirname, '../../..')
const check = (rest: string) => brokenGithubLink(repository, `${GITHUB}/${rest}`)

describe('a link to a file on main', () => {
  test('that exists is fine, a folder too', () => {
    expect(check('blob/main/CHANGELOG.md')).toBeUndefined()
    expect(check('tree/main/packages/remote')).toBeUndefined()
  })

  test('that does not exist is broken', () => {
    expect(check('blob/main/CHANGELOG.mdx')).toMatch(/CHANGELOG\.mdx is not in the repository/)
  })
})

describe('a link pinned to a release tag', () => {
  test('to a file, a folder and a heading of that tag is fine', () => {
    expect(check('blob/v0.41.0/CHANGELOG.md')).toBeUndefined()
    expect(check('tree/v0.41.0/packages/remote')).toBeUndefined()
    expect(check('blob/v0.41.0/CHANGELOG.md#0410')).toBeUndefined()
  })

  test('to a mistyped path is broken, the tag named', () => {
    expect(check('blob/v0.41.0/CHANGELOG.mdx')).toMatch(
      /CHANGELOG\.mdx is not in the tree of v0\.41\.0/,
    )
    expect(check('tree/v0.41.0/packages/remot')).toMatch(/is not in the tree of v0\.41\.0/)
  })

  test('to a heading the file lacks at that tag is broken', () => {
    expect(check('blob/v0.41.0/CHANGELOG.md#no-such-heading')).toMatch(
      /no #no-such-heading in CHANGELOG\.md at v0\.41\.0/,
    )
  })

  test('to a tag that is not here says to fetch the tags', () => {
    expect(check('blob/v99.0.0/CHANGELOG.md')).toMatch(/fetch the tags/)
  })

  test('is not read as a file in the working tree', () => {
    // On main the path exists; at the tag it does not, and only the tag counts.
    expect(check('blob/v0.41.0/examples/site/test/githubLinks.ts')).toMatch(
      /is not in the tree of v0\.41\.0/,
    )
  })
})

test('a link elsewhere is not its business', () => {
  expect(brokenGithubLink(repository, 'https://foldkit.dev/nope')).toBeUndefined()
})
