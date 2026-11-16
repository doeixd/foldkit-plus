// @vitest-environment node
/**
 * The accessibility notes of the component pages: each names a page there is and a heading of the
 * README it links, and the page draws them.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { anchorOf, notesFor } from '../src/gallery/notes.js'
import { README } from '../src/gallery/related.js'
import { showcases } from '../src/gallery/showcases.js'

const readme = readFileSync(resolve(import.meta.dirname, '../../..', README), 'utf8')
const headings = new Set(
  [...readme.matchAll(/^#{1,4} (.+)$/gm)].map(match => anchorOf(match[1]!.replaceAll('`', ''))),
)

describe('the accessibility notes', () => {
  const withNotes = showcases.filter(showcase => notesFor(showcase.slug) !== undefined)

  it('are written for the pages that lacked them', () => {
    expect(withNotes.map(showcase => showcase.slug)).toEqual(
      expect.arrayContaining([
        'disclosure',
        'aspect-ratio',
        'code-block',
        'fieldset',
        'figure',
        'icon',
        'image',
        'label',
        'typography',
        'drawer',
        'app-shell',
      ]),
    )
  })

  it.each(withNotes.map(showcase => showcase.slug))('%s links a heading the README has', slug => {
    const notes = notesFor(slug)!
    expect(notes.lines.length).toBeGreaterThan(0)
    expect(headings.has(anchorOf(notes.heading))).toBe(true)
  })

  it('refuse a slug no page has', () => {
    expect(notesFor('nonsense')).toBeUndefined()
  })
})
