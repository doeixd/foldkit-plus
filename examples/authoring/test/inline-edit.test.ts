/**
 * What the Model decides about a rename, with no page: which values are
 * refused and why, what a refusal keeps, and the Model handed back when
 * nothing changes.
 */
import { Option } from 'effect'
import { InlineEdit } from 'foldkit-primitives/interaction'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import {
  BLANK,
  Message,
  Rename,
  TAKEN,
  initial,
  refusalOf,
  update,
  type Model,
} from '../src/inline-edit/app.js'
import { runDemo } from '../src/inline-edit/demo.js'
import { EditableTitles } from '../src/inline-edit/view.js'
import { pageStylesheet } from '../src/style.js'

const send = (model: Model, message: InlineEdit.Message): Model =>
  update(model, Rename.wrapper.make(message)).model

const typed = (id: string, from: string, text: string): Model =>
  send(
    send(initial().model, InlineEdit.Message.Started({ id, text: from })),
    InlineEdit.Message.Changed({ id, text }),
  )

const titlesOf = (model: Model) => model.titles.map(title => title.text)

describe('which titles are allowed', () => {
  const titles = initial().model.titles
  it.each([
    ['', BLANK],
    ['   ', BLANK],
    [' write the guide ', TAKEN],
  ])('refuses %j for another row', (value, reason) => {
    expect(refusalOf(titles, 'title-3', value)).toEqual(Option.some(reason))
  })

  it('refuses a case-insensitive match of another row', () => {
    expect(refusalOf(titles, 'title-1', 'SHIP IT')).toEqual(Option.some(TAKEN))
  })

  it.each([
    ['title-3', 'Ship it'],
    ['title-3', 'SHIP IT'],
    ['title-3', 'Ship it today'],
  ])('allows %s to become %j', (id, value) => {
    expect(refusalOf(titles, id, value)).toEqual(Option.none())
  })
})

describe('committing a rename', () => {
  it('writes an allowed title, trimmed, and closes the editor', () => {
    const done = send(
      typed('title-3', 'Ship it', '  Ship it today '),
      InlineEdit.Message.Entered({ id: 'title-3' }),
    )
    expect(titlesOf(done)).toEqual(['Write the guide', 'Review the pull request', 'Ship it today'])
    expect(Option.isNone(done.rename.editing)).toBe(true)
  })

  it('keeps a refused value open on the draft, with the reason, and changes no title', () => {
    const refused = send(
      typed('title-3', 'Ship it', 'write the guide'),
      InlineEdit.Message.Entered({ id: 'title-3' }),
    )
    expect(titlesOf(refused)).toEqual(titlesOf(initial().model))
    const editing = Option.getOrThrow(refused.rename.editing)
    expect(editing.draft).toBe('write the guide')
    expect(editing.error).toEqual(Option.some(TAKEN))
  })

  it('clears the reason when the draft changes, and a blank draft is refused as blank', () => {
    const refused = send(
      typed('title-3', 'Ship it', ''),
      InlineEdit.Message.Entered({ id: 'title-3' }),
    )
    expect(Option.getOrThrow(refused.rename.editing).error).toEqual(Option.some(BLANK))
    const edited = send(refused, InlineEdit.Message.Changed({ id: 'title-3', text: 'x' }))
    expect(Option.getOrThrow(edited.rename.editing).error).toEqual(Option.none())
  })

  it('commits nothing for a title left as it was', () => {
    const same = typed('title-3', 'Ship it', 'Ship it')
    const done = send(same, InlineEdit.Message.Entered({ id: 'title-3' }))
    expect(titlesOf(done)).toEqual(titlesOf(initial().model))
    expect(Option.isNone(done.rename.editing)).toBe(true)
  })

  it('drops the draft on Escape and returns the Model it was given when nothing is open', () => {
    const cancelled = send(
      typed('title-3', 'Ship it', 'x'),
      InlineEdit.Message.Escaped({ id: 'title-3' }),
    )
    expect(Option.isNone(cancelled.rename.editing)).toBe(true)
    expect(titlesOf(cancelled)).toEqual(titlesOf(initial().model))
    expect(send(cancelled, InlineEdit.Message.Escaped({ id: 'title-3' }))).toBe(cancelled)
  })
})

describe('adding a title', () => {
  it('appends a numbered title, which then takes part in the duplicate check', () => {
    const added = update(initial().model, Message.Added()).model
    expect(titlesOf(added).at(-1)).toBe('New title 1')
    expect(refusalOf(added.titles, 'title-1', 'new title 1')).toEqual(Option.some(TAKEN))
  })
})

describe('the view', () => {
  it('draws only Slots: the display for a closed row, the field and the reason for an open one', () => {
    const refused = send(
      typed('title-3', 'Ship it', ''),
      InlineEdit.Message.Entered({ id: 'title-3' }),
    )
    for (const model of [initial().model, refused]) {
      const tree = Inert.draw(EditableTitles, model)
      expect(Inert.unslotted(tree)).toEqual([])
      expect(Inert.missingTokens(tree, pageStylesheet)).toEqual([])
    }
    expect(Inert.byTag(Inert.draw(EditableTitles, refused), 'input')).toHaveLength(1)
    expect(Inert.byTag(Inert.draw(EditableTitles, initial().model), 'input')).toHaveLength(0)
  })
})

describe('the demo trace', () => {
  it('prints a refusal and an acceptance', () => {
    expect(runDemo()).toEqual([
      'titles: Write the guide | Review the pull request | Ship it',
      'a duplicate: open on title-3 with "write the guide" (Another title already says that.)',
      'a new title: closed; titles: Write the guide | Review the pull request | Ship it today',
    ])
  })
})
