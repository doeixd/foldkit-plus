/**
 * The family's slash catalogue and keys (§123): the editor's catalogue with each
 * Message wrapped for this caller, and the movement rule over the primitive. The query,
 * the matching, and the menu are `foldkit-richtext-dom/editor`'s and tested there.
 */
import { describe, expect, it } from 'vitest'
import { Message, type EditorEvent } from 'foldkit-richtext-dom/editor'
import { slashEntries, slashMove } from '../src/slash.js'

const plain = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

describe('the catalogue the family offers', () => {
  const entries = () => slashEntries((message: EditorEvent) => ({ _tag: 'Wrapped', message }))

  it('offers the editor’s catalogue, not a second one', () => {
    expect(entries().map(entry => entry.id)).toEqual([
      'paragraph',
      'heading-1',
      'heading-2',
      'heading-3',
      'bold',
      'italic',
      'code',
    ])
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
  })
})

describe('moving the highlight with the keys a menu owns', () => {
  const entries = slashEntries((message: EditorEvent) => message)
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
