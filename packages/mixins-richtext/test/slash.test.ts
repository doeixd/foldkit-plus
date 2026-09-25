/**
 * The slash menu's vocabulary (§123): what opens a menu, what it offers, what filters
 * it, and what choosing sends. The view is the next slice; this is the part a menu and
 * an application that draws its own agree on.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { Message, type EditorEvent } from 'foldkit-richtext-dom/editor'
import { matchingEntries, slashEntries, slashMenu, slashMove, slashQuery } from '../src/slash.js'

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

describe('the entries a menu offers', () => {
  const entries = () => slashEntries((message: EditorEvent) => ({ _tag: 'Wrapped', message }))

  it('leads with the text blocks, then the marks, each keyed by a stable id', () => {
    const ids = entries().map(entry => entry.id)
    expect(ids).toEqual([
      'paragraph',
      'heading-1',
      'heading-2',
      'heading-3',
      'bold',
      'italic',
      'code',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sends the editor Message each entry means, through the caller’s wrapper', () => {
    const byId = new Map(entries().map(entry => [entry.id, entry]))
    expect(byId.get('heading-2')?.message).toEqual({
      _tag: 'Wrapped',
      message: Message.RetypedBlock({ block: { type: 'Heading', level: 2 } }),
    })
    expect(byId.get('bold')?.message).toEqual({
      _tag: 'Wrapped',
      message: Message.ToggledMark({ mark: 'Bold' }),
    })
    // Every mark the package ships is offered, none invented.
    const shipped = RichText.shippedMarks.map(definition => definition.name.toLowerCase())
    expect(
      entries()
        .filter(entry => shipped.includes(entry.id))
        .map(entry => entry.id),
    ).toEqual(shipped)
  })
})

describe('filtering the entries', () => {
  const entries = slashEntries((message: EditorEvent) => message)

  it('offers everything for an empty query, including `/` alone', () => {
    expect(matchingEntries(entries, '')).toHaveLength(entries.length)
    expect(matchingEntries(entries, '  ')).toHaveLength(entries.length)
  })

  it('matches labels and keywords, case-insensitively, anywhere in the word', () => {
    const ids = (query: string) => matchingEntries(entries, query).map(entry => entry.id)
    expect(ids('head')).toEqual(['heading-1', 'heading-2', 'heading-3'])
    expect(ids('HEADING 2')).toEqual(['heading-2'])
    expect(ids('h3')).toEqual(['heading-3'])
    expect(ids('strong')).toEqual(['bold'])
    expect(ids('mono')).toEqual(['code'])
  })

  it('offers nothing when nothing matches, rather than everything', () => {
    expect(matchingEntries(entries, 'zzz')).toEqual([])
  })
})

describe('the menu a caret is in', () => {
  const entries = slashEntries((message: EditorEvent) => message)
  const label = (textBefore: string, index: number) =>
    slashMenu(entries, textBefore, index)?.highlighted?.label

  it('is nothing at all when the text is not a query', () => {
    expect(slashMenu(entries, 'a sentence', 0)).toBeUndefined()
    expect(slashMenu(entries, '', 0)).toBeUndefined()
  })

  it('is the whole catalogue for a lone slash, and narrows as the query grows', () => {
    const bare = slashMenu(entries, '/', 0)
    expect(bare?.query).toBe('')
    expect(bare?.matches).toHaveLength(entries.length)
    // A query is a word, so a multi-word label is reached by its keywords: `h1` and
    // `title` both mean Heading 1.
    const narrowed = slashMenu(entries, '/h1', 0)
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
    const empty = slashMenu(entries, '/zzz', 0)
    expect(empty?.matches).toEqual([])
    expect(empty?.highlighted).toBeUndefined()
  })
})

describe('moving the highlight with the keys a menu owns', () => {
  const entries = slashEntries((message: EditorEvent) => message)
  const plain = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
  const moved = (textBefore: string, index: number, key: string, modifiers = plain) =>
    slashMove(entries, textBefore, index, key, modifiers)

  it('moves over the matches and wraps at both ends', () => {
    expect(moved('/head', 0, 'ArrowDown')).toBe(1)
    expect(moved('/head', 2, 'ArrowDown')).toBe(0)
    expect(moved('/head', 0, 'ArrowUp')).toBe(2)
  })

  it('jumps to the ends with Home and End, and ignores what it does not own', () => {
    expect(moved('/head', 1, 'Home')).toBe(0)
    expect(moved('/head', 1, 'End')).toBe(2)
    expect(moved('/head', 1, 'ArrowDown', { ...plain, metaKey: true })).toBeUndefined()
    expect(moved('/head', 0, 'a')).toBeUndefined()
    expect(moved('/head', 0, 'Escape')).toBeUndefined()
  })

  it('moves nothing when there is no menu, or nothing matches', () => {
    expect(moved('a sentence', 0, 'ArrowDown')).toBeUndefined()
    expect(moved('/zzz', 0, 'ArrowDown')).toBeUndefined()
  })

  it('moves from what the menu highlights, not from a remembered index past it', () => {
    // Three matches, a remembered index of 5: the highlight is on the first, so Down
    // goes to the second rather than restarting at the top.
    expect(moved('/head', 5, 'ArrowDown')).toBe(1)
  })
})
