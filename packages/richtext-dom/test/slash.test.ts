/**
 * The slash menu's vocabulary (§123): what opens a menu, what the editor offers, what
 * filters it, and what choosing sends. The view is the family's and `slashMove` lives
 * with it; the query, the catalogue, and the menu are the editor's, so the Bundle and
 * the view read one answer.
 */
import { describe, expect, it } from 'vitest'
import { matchingEntries, Message, slashEntries, slashMenu, slashQuery } from '../src/editor.js'

describe('the query a caret is in', () => {
  it.each([
    ['/', ''],
    ['/h', 'h'],
    ['/head-2', 'head-2'],
    ['see /head', 'head'],
    ['', undefined],
    ['see/head', undefined],
    ['/head ', undefined],
    ['a sentence', undefined],
    ['/head/2', undefined],
  ])('reads %j as %j', (textBefore, query) => {
    expect(slashQuery(textBefore)).toBe(query)
  })
})

describe('the entries the editor offers', () => {
  it('leads with the text blocks, then the containers, then the marks, each keyed by a stable id', () => {
    const ids = slashEntries.map(entry => entry.id)
    expect(ids).toEqual([
      'paragraph',
      'heading-1',
      'heading-2',
      'heading-3',
      'quote',
      'bulleted-list',
      'numbered-list',
      'code-block',
      'bold',
      'italic',
      'code',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sends the editor Message each entry means, so Enter needs no new vocabulary', () => {
    const byId = new Map(slashEntries.map(entry => [entry.id, entry]))
    expect(byId.get('heading-2')?.message).toEqual(
      Message.RetypedBlock({ block: { type: 'Heading', level: 2 } }),
    )
    expect(byId.get('bold')?.message).toEqual(Message.ToggledMark({ mark: 'Bold' }))
    expect(byId.get('numbered-list')?.message).toEqual(
      Message.WrappedBlock({
        containers: [{ kind: 'List', props: { ordered: true } }, { kind: 'ListItem' }],
      }),
    )
    expect(byId.get('code-block')?.message).toEqual(
      Message.ConvertedBlock({ to: { kind: 'CodeBlock' } }),
    )
  })
})

describe('filtering the entries', () => {
  it('offers everything for an empty query, including `/` alone', () => {
    expect(matchingEntries(slashEntries, '')).toHaveLength(slashEntries.length)
    expect(matchingEntries(slashEntries, '  ')).toHaveLength(slashEntries.length)
  })

  it('matches labels and keywords, case-insensitively, anywhere in the word', () => {
    const ids = (query: string) => matchingEntries(slashEntries, query).map(entry => entry.id)
    expect(ids('head')).toEqual(['heading-1', 'heading-2', 'heading-3'])
    expect(ids('HEADING 2')).toEqual(['heading-2'])
    expect(ids('h3')).toEqual(['heading-3'])
    expect(ids('strong')).toEqual(['bold'])
    expect(ids('mono')).toEqual(['code'])
  })

  it('offers nothing when nothing matches, rather than everything', () => {
    expect(matchingEntries(slashEntries, 'zzz')).toEqual([])
  })
})

describe('the menu a caret is in', () => {
  const label = (textBefore: string, index: number) =>
    slashMenu(slashEntries, textBefore, index)?.highlighted?.label

  it('is nothing at all when the text is not a query', () => {
    expect(slashMenu(slashEntries, 'a sentence', 0)).toBeUndefined()
    expect(slashMenu(slashEntries, '', 0)).toBeUndefined()
  })

  it('is the whole catalogue for a lone slash, and narrows as the query grows', () => {
    const bare = slashMenu(slashEntries, '/', 0)
    expect(bare?.query).toBe('')
    expect(bare?.matches).toHaveLength(slashEntries.length)
    // A query is a word, so a multi-word label is reached by its keywords: `h1` and
    // `title` both mean Heading 1.
    const narrowed = slashMenu(slashEntries, '/h1', 0)
    expect(narrowed?.matches.map(entry => entry.label)).toEqual(['Heading 1'])
    expect(narrowed?.highlighted?.label).toBe('Heading 1')
  })

  it('reads an index from the text before the caret, whatever the caller last had', () => {
    expect(label('/head', 1)).toBe('Heading 2')
    // The query narrowed past the remembered index: the highlight returns to the top
    // rather than leaving Enter with nothing.
    expect(label('/h1', 3)).toBe('Heading 1')
    expect(label('/head', -1)).toBe('Heading 1')
  })

  it('is a menu with nothing to choose when the query matches nothing', () => {
    const empty = slashMenu(slashEntries, '/zzz', 0)
    expect(empty?.matches).toEqual([])
    expect(empty?.highlighted).toBeUndefined()
  })
})
