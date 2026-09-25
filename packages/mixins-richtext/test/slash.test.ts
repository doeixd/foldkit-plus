/**
 * The slash menu's vocabulary (§123): what opens a menu, what it offers, what filters
 * it, and what choosing sends. The view is the next slice; this is the part a menu and
 * an application that draws its own agree on.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { Message, type EditorEvent } from 'foldkit-richtext-dom/editor'
import { matchingEntries, slashEntries, slashQuery } from '../src/slash.js'

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
