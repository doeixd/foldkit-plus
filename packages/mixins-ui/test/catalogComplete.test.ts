/**
 * The catalog names every `*Slots` the package publishes, or says why one has
 * no pattern. A widget added without either fails here.
 */
import { describe, expect, it } from 'vitest'
import * as Ui from '../src/index.js'

/** A Slots contract with no accessibility structure its slots could require today. */
const noPattern = [
  ['AspectRatioSlots', 'a box that keeps a ratio; its slots publish no attribute or event'],
  [
    'AvatarSlots',
    'an image or initials; its slots publish no attribute, so a name has nothing to require',
  ],
  ['AvatarGroupSlots', 'a row of avatars; its slots publish no attribute'],
  ['BadgeSlots', 'a text mark; its slots publish no attribute or event'],
  ['CardGroupSlots', 'a grid of cards; its slots publish no attribute or event'],
  ['ChatMessageGroupSlots', 'a run of messages; its slots publish no attribute or event'],
  ['CodeBlockSlots', 'preformatted text; its slots publish no attribute or event'],
  ['EmptySlots', 'a text placeholder; its slots publish no attribute or event'],
  ['FigureSlots', 'a figure and its caption; its slots publish no attribute'],
  ['IconSlots', 'a glyph that names itself or hides; its slots publish no attribute'],
  ['ImageSlots', 'an image that names itself or is decorative; its slots publish no attribute'],
  ['ItemSlots', 'a row of text; its slots publish no attribute or event'],
  ['ItemGroupSlots', 'a list of rows; its slots publish no attribute'],
  ['KbdSlots', 'a key cap; its slots publish no attribute or event'],
  ['LabelSlots', 'a text label; its slots publish no attribute or event'],
  ['SeparatorSlots', 'a rule that is a separator or none; its slots publish no attribute'],
  ['SkeletonSlots', 'a loading mark; its slots publish no attribute'],
  ['SpinnerSlots', 'a loading mark; its slots publish no attribute'],
  ['TypographySlots', 'text styles; its slots publish no attribute or event'],
] as const

const published = Object.entries(Ui).filter(([name]) => name.endsWith('Slots'))

const covered = (slots: unknown, catalog: typeof Ui.Patterns.catalog): boolean =>
  catalog.some(entry => entry.slots === slots)

describe('Patterns.catalog completeness', () => {
  it('finds the published Slots', () => {
    expect(published.length).toBeGreaterThan(60)
  })

  it('gives each a pattern, or a reason not to, and never both', () => {
    const faults = published.flatMap(([name, slots]) => {
      const inCatalog = covered(slots, Ui.Patterns.catalog)
      const allowed = noPattern.some(([allowedName]) => allowedName === name)
      if (!inCatalog && !allowed) return [`${name} is in neither the catalog nor the allowlist`]
      return inCatalog && allowed ? [`${name} is in both the catalog and the allowlist`] : []
    })
    expect(faults).toEqual([])
  })

  it('allows only Slots the package publishes', () => {
    const names = new Set(published.map(([name]) => name))
    expect(noPattern.filter(([name]) => !names.has(name))).toEqual([])
  })
})
