/**
 * The source session (§136): leaving it unedited gives back the caller's document whole,
 * and editing it parses the draft and reports what the edit loses.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { closeSource, openSource, SourceSession } from '../src/index.js'

/** A heading, and a paragraph with a mark Markdown has no syntax for. */
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Heading',
        id: 'h',
        level: 1,
        children: [{ type: 'Text', id: 'h-t', text: 'Title', marks: [] }],
      },
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'p-t', text: 'marked', marks: ['Highlight'] }],
      },
    ],
  })
const minted = () => {
  let n = 0
  return { mint: () => `m${++n}` }
}

describe('a Markdown source session', () => {
  it('opens on the document’s Markdown, reporting what it cannot show', () => {
    const session = openSource(document())
    expect(session.draft).toBe('# Title\n\nmarked\n')
    expect(session.printed).toBe(session.draft)
    expect(session.unprintable).toEqual([
      { code: 'UnsupportedMark', detail: 'Highlight', node: 'p-t' },
    ])
  })

  it('gives back the caller’s document itself when the draft was not edited', () => {
    const original = document()
    const closed = closeSource(openSource(original), original, minted())
    expect(closed).toEqual({ document: original, changed: false, diagnostics: [], style: {} })
    expect(closed.document).toBe(original)
  })

  it('parses an edited draft, reporting the unprintable mark the edit loses', () => {
    const original = document()
    const session = openSource(original)
    const closed = closeSource(
      { ...session, draft: '# Title\n\nmarked, and *more*\n' },
      original,
      minted(),
    )
    expect(closed.changed).toBe(true)
    expect(closed.document.children.map(block => block.type)).toEqual(['Heading', 'Paragraph'])
    expect(closed.document.children[1]?.children.map(run => [run.text, run.marks])).toEqual([
      ['marked, and ', []],
      ['more', ['Italic']],
    ])
    expect(closed.diagnostics).toEqual([
      { code: 'UnsupportedMark', detail: 'Highlight', node: 'p-t' },
    ])
  })

  it('reports what parsing the draft refused, after what the edit loses', () => {
    const original = document()
    const closed = closeSource(
      { ...openSource(original), draft: '[x](javascript:alert(1))\n' },
      original,
      minted(),
    )
    expect(closed.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'UnsupportedMark',
      'UnsafeUrl',
    ])
  })

  it('is a value a Model can hold: it decodes as the schema says', () => {
    const session = openSource(document())
    expect(Schema.decodeUnknownSync(SourceSession)(session)).toEqual(session)
  })

  it('keeps the writer’s spelling from one session to the next', () => {
    const original = document()
    const first = closeSource(
      { ...openSource(original), draft: '# Title\n\n_marked_ and\n\n* a\n' },
      original,
      minted(),
    )
    expect(first.style).toEqual({ heading: 'atx', emphasis: '_', bullet: '*' })
    // Reopening with that style prints the document as it was written, not canonically.
    const again = openSource(first.document, first.style)
    expect(again.draft).toBe('# Title\n\n_marked_ and\n\n* a\n')
    // Closing it unedited keeps the style; editing keeps what the new text no longer spells.
    expect(closeSource(again, first.document, minted()).style).toEqual(first.style)
    const edited = closeSource({ ...again, draft: '__bold__\n' }, first.document, minted())
    expect(edited.style).toEqual({ heading: 'atx', emphasis: '_', bullet: '*', strong: '__' })
  })
})
