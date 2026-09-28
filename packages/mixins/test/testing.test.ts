/**
 * `Inert` reads an inert tree as a browser would: an attribute or a property
 * through one call, an element by its label however it is labelled.
 */
import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'

const h = SlotView.inertBuilder<never>()
const page = h.main(
  [h.Role('main')],
  [
    h.button([h.Title('Save the page'), h.AriaPressed('true'), h.Class('primary big')], ['Save']),
    h.label([h.For('name')], ['Name']),
    h.input([h.Id('name'), h.Value('Ada')]),
    h.nav([h.AriaLabel('Sections')], [h.a([], ['Home'])]),
    h.li([], [h.button([], ['Publish'])]),
  ],
)

describe('Inert', () => {
  it('reads a property and an attribute through one call', () => {
    const [save] = Inert.byTag(page, 'button')
    expect(Inert.value(save, 'title')).toBe('Save the page')
    expect(Inert.value(Inert.byTag(page, 'input')[0], 'value')).toBe('Ada')
    expect(Inert.value(page, 'role')).toBe('main')
    expect(Inert.classes(save)).toEqual(['primary', 'big'])
  })

  it('finds an element by its aria-label, its <label for>, or its innermost text', () => {
    expect(Inert.byLabel(page, 'Sections').map(node => node.sel)).toEqual(['nav'])
    expect(Inert.byLabel(page, 'Name').map(node => node.sel)).toEqual(['input'])
    // The list item's text is "Publish" too; only the button inside it counts.
    expect(Inert.byLabel(page, 'Publish').map(node => node.sel)).toEqual(['button'])
    expect(Inert.byLabel(page, 'Nothing')).toEqual([])
  })

  it('says whether a toggle is pressed, and nothing for one that is not a toggle', () => {
    const [save, publish] = Inert.byTag(page, 'button')
    expect(Inert.pressed(save)).toEqual(Option.some(true))
    expect(Inert.pressed(publish)).toEqual(Option.none())
    expect(Inert.byRole(page, 'main')).toHaveLength(1)
    expect(Inert.text(page)).toBe('SaveNameHomePublish')
  })
})

describe('Inert.draw and what it checks', () => {
  const CardSlots = Slots.define({
    root: Slot.make({ capability: Capability.Container }),
    title: Slot.make({ capability: Capability.Container }),
    body: Slot.make({ capability: Capability.Container }),
  })
  const Card = SlotView.forMessages<never>().define(CardSlots, (_: void, slots, h) =>
    h.article(slots.root.attrs([h.Style({ '--fk-gap': '1rem', color: 'red' })]), [
      h.h2(slots.title.attrs(), ['Title']),
      h.span([], ['stray']),
      h.div(slots.body.attrs(), [h.p([], ['the application’s own'])]),
    ]),
  )
  const root = Inert.draw(Card, undefined)

  it('marks what each Slot drew', () => {
    expect(Inert.bySlot(root, 'title').map(Inert.text)).toEqual(['Title'])
  })

  it('lists what no Slot drew, but not what a Slot named `inside` holds', () => {
    expect(Inert.unslotted(root, { inside: ['body'] })).toEqual(['article > span'])
    expect(Inert.unslotted(root)).toEqual(['article > span', 'article > div > p'])
  })

  it('lists inline declarations that are not custom properties', () => {
    expect(Inert.fixedInline(root)).toEqual(['article: color'])
  })

  it('leaves no mark on a view drawn as it would be for real', () => {
    const drawn = Card(undefined, SlotView.inertBuilder())
    expect(Inert.bySlot(drawn, 'title')).toEqual([])
  })
})
