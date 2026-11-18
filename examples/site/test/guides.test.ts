/**
 * Guide pages cut from Markdown: where a file splits, what each page is
 * called, and where its links lead once the files are pages.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { allSubsites, type Subsite } from '../src/catalog.js'
import { GITHUB, guidePages, headingOf, slugger } from '../src/content/guides.js'
import { textOf } from '../src/content/text.js'

const long = (words: string) => `${words} `.repeat(120).trim()

/** A repository in a temporary folder: two packages, one subsite over both. */
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'site-guides-'))
  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  write(
    'packages/alpha/README.md',
    [
      '# `foldkit-alpha`',
      '',
      'Alpha does one thing.',
      '',
      '## Install',
      '',
      'Short enough to stay with the overview.',
      '',
      '## The mental model',
      '',
      long('A model.'),
      '',
      '### A detail',
      '',
      'See [the beta server](../beta/README.md#serving-it), [install](#install),',
      '[the example](../../examples/alpha), [a file](../../examples/alpha/main.ts) and [Effect](https://effect.website).',
      '',
      '## The mental model',
      '',
      long('Again.'),
    ].join('\n'),
  )
  write(
    'packages/beta/README.md',
    ['# `foldkit-beta`', '', 'Beta serves.', '', '## Serving it', '', long('Serve.')].join('\n'),
  )
  write(
    'packages/gamma/README.md',
    [
      '# `foldkit-gamma`',
      '',
      'Gamma does one thing.',
      '',
      '## What it owns',
      '',
      long('Owns.'),
      '',
      '## The mental model',
      '',
      long('A loop.'),
      '',
      '## Install',
      '',
      'One line.',
      '',
      '## Sixty seconds: one call',
      '',
      long('Call.'),
      '',
      '## Core concepts',
      '',
      long('Concepts.'),
    ].join('\n'),
  )
  mkdirSync(join(root, 'examples/alpha'), { recursive: true })
  writeFileSync(join(root, 'examples/alpha/main.ts'), '')
  const subsite: Subsite = {
    id: 'alpha',
    title: 'Alpha',
    tagline: '',
    owner: '',
    shelf: 'Foundations',
    packages: ['alpha', 'beta', 'gamma'],
    sources: [
      { id: 'alpha', label: 'foldkit-alpha', file: 'packages/alpha/README.md' },
      { id: 'beta', label: 'foldkit-beta', file: 'packages/beta/README.md' },
      { id: 'gamma', label: 'foldkit-gamma', file: 'packages/gamma/README.md' },
    ],
  }
  return guidePages(root, [subsite]).pages
}

describe('slugger', () => {
  it('ids headings as GitHub does, numbering a repeat', () => {
    const slug = slugger()
    expect(
      ['The mental model', 'RemoteData: what now?', 'The mental model', '`Remote.resume`'].map(
        slug,
      ),
    ).toEqual(['the-mental-model', 'remotedata-what-now', 'the-mental-model-1', 'remoteresume'])
  })
})

describe('headingOf', () => {
  it("drops the family's prefix from a package's first page, and from no other", () => {
    const pages = fixture()
    const at = (path: string) => headingOf(pages.find(page => page.path === path)!)
    expect(at('/alpha')).toEqual({ heading: 'alpha' })
    expect(at('/alpha/guides/the-mental-model')).toEqual({})
    expect(at('/alpha/guides/beta')).toEqual({ heading: 'beta' })
    expect(at('/alpha/guides/beta/serving-it')).toEqual({})
  })

  it('keeps foldkit-plus whole, and a document that is no package README', () => {
    const readme = (name: string, file: string) => ({
      first: true,
      title: name,
      source: { id: 'x', label: name, file },
    })
    expect(headingOf(readme('foldkit-plus', 'packages/plus/README.md'))).toEqual({})
    expect(headingOf(readme('foldkit-remote', 'docs/remote.md'))).toEqual({})
    expect(headingOf(readme('Remote', 'packages/remote/README.md'))).toEqual({})
  })
})

describe('guidePages', () => {
  it('cuts each file at its second-level headings, joining a short section to the page before it', () => {
    expect(fixture().map(page => [page.path, page.label, page.title])).toEqual([
      ['/alpha', 'Overview', 'foldkit-alpha'],
      ['/alpha/guides/the-mental-model', 'The mental model', 'The mental model'],
      ['/alpha/guides/the-mental-model-1', 'The mental model', 'The mental model'],
      ['/alpha/guides/beta', 'Overview', 'foldkit-beta'],
      ['/alpha/guides/beta/serving-it', 'Serving it', 'Serving it'],
      ['/alpha/guides/gamma', 'Overview', 'foldkit-gamma'],
      ['/alpha/guides/gamma/core-concepts', 'Core concepts', 'Core concepts'],
    ])
  })

  it("takes a package's opening, ownership, mental model, install and example into its first page", () => {
    const gamma = fixture().find(page => page.path === '/alpha/guides/gamma')!
    expect(gamma.anchors.map(anchor => anchor.text)).toEqual([
      'What it owns',
      'The mental model',
      'Install',
      'Sixty seconds: one call',
    ])
    // A heading moved onto the first page is an anchor there, not a page of its own.
    expect(gamma.href('#the-mental-model')).toBe('/alpha/guides/gamma#the-mental-model')
  })

  it('keeps a joined section under its heading, and lists the headings a page holds', () => {
    const [overview, model] = fixture()
    expect(overview!.nodes.map(node => textOf(node))).toEqual([
      'Alpha does one thing.',
      'Install',
      'Short enough to stay with the overview.',
    ])
    expect(overview!.description).toBe('Alpha does one thing.')
    expect(model!.anchors).toEqual([{ depth: 3, text: 'A detail', id: 'a-detail' }])
  })

  it('points a link at the page that holds its target, or at GitHub', () => {
    const [, model] = fixture()
    expect(
      [
        '../beta/README.md#serving-it',
        '#install',
        '../../examples/alpha',
        '../../examples/alpha/main.ts',
        'https://effect.website',
        `${GITHUB}/blob/main/packages/beta/README.md`,
      ].map(model!.href),
    ).toEqual([
      // A heading a page starts at is the page's title: the page, with no anchor.
      '/alpha/guides/beta/serving-it',
      '/alpha#install',
      `${GITHUB}/tree/main/examples/alpha`,
      `${GITHUB}/blob/main/examples/alpha/main.ts`,
      'https://effect.website',
      '/alpha/guides/beta',
    ])
  })
})

describe('the published guides', () => {
  // Design notes and plans are the repository's working papers, not documentation.
  const working = /docs\/design\/|-DESIGN\b|DESIGN\.md|-PLAN\b|PLAN\.md|REVISION_PLAN|§\d/

  it('name no design note or plan, in their words or their links', () => {
    const repository = fileURLToPath(new URL('../../..', import.meta.url))
    const mentions = guidePages(repository, allSubsites).pages.flatMap(page => {
      const said = JSON.stringify(page.nodes)
      const match = working.exec(said)
      return match === null
        ? []
        : [`${page.path}: …${said.slice(match.index - 40, match.index + 40)}…`]
    })
    expect(mentions).toEqual([])
    // It builds every published page from the repository: seconds, under a full run's load.
  }, 30_000)
})
