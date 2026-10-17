/**
 * Cascade Select as a transition and as markup: opening starts at the value
 * or the first option, the keys move within a level and between levels,
 * skipping what is disabled, only an option without children is chosen
 * unless parents are allowed, and the open panel is a tree whose active row
 * `aria-activedescendant` names.
 */
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Attr, Capability, Event } from 'foldkit-mixins'
// From the modules, not the index: the test reads nothing else.
import * as CascadeSelect from '../src/cascadeSelect.js'
import { CascadeSelectSlots, type Config, type Node } from '../src/cascadeSelect.js'
import { h, message } from './fixture.js'

const { Message, init } = CascadeSelect

const nodes: ReadonlyArray<Node> = [
  {
    id: 'ca',
    label: 'Canada',
    children: [
      {
        id: 'on',
        label: 'Ontario',
        children: [
          { id: 'tor', label: 'Toronto' },
          { id: 'ott', label: 'Ottawa' },
        ],
      },
      {
        id: 'bc',
        label: 'British Columbia',
        disabled: true,
        children: [{ id: 'van', label: 'Vancouver' }],
      },
      { id: 'qc', label: 'Quebec', children: [{ id: 'mtl', label: 'Montreal' }] },
    ],
  },
  { id: 'us', label: 'United States', children: [{ id: 'tx', label: 'Texas' }] },
  { id: 'mx', label: 'Mexico' },
]

const config: Config = { nodes }
const update = CascadeSelect.update(config)
const open = (value?: ReadonlyArray<string>) =>
  update(init({ id: 'place', value }), Message.Opened()).model
const keys = (model: CascadeSelect.Model, ...pressed: ReadonlyArray<string>) =>
  pressed.reduce((at, key) => update(at, Message.Pressed({ key })).model, model)
const names = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  (result.commands ?? []).map(command => command.name)

describe('CascadeSelect.update', () => {
  it('opens on the first option, or on the chosen path', () => {
    expect(open().highlighted).toEqual(['ca'])
    expect(open(['ca', 'on', 'ott']).highlighted).toEqual(['ca', 'on', 'ott'])
    // A value that names no option starts at the first, as with none.
    expect(open(['ca', 'gone']).highlighted).toEqual(['ca'])
  })

  it('moves down and up a level, skipping a disabled option, and stops at its ends', () => {
    const inCanada = keys(open(), 'ArrowRight')
    expect(inCanada.highlighted).toEqual(['ca', 'on'])
    expect(keys(inCanada, 'ArrowDown').highlighted).toEqual(['ca', 'qc'])
    expect(keys(inCanada, 'ArrowDown', 'ArrowUp').highlighted).toEqual(['ca', 'on'])
    const last = keys(open(), 'End')
    expect(last.highlighted).toEqual(['mx'])
    expect(update(last, Message.Pressed({ key: 'ArrowDown' })).model).toBe(last)
    expect(keys(last, 'Home').highlighted).toEqual(['ca'])
  })

  it('wraps at a level’s ends when it loops', () => {
    const looping = CascadeSelect.update({ nodes, loop: true })
    const last = looping(open(), Message.Pressed({ key: 'End' })).model
    expect(looping(last, Message.Pressed({ key: 'ArrowDown' })).model.highlighted).toEqual(['ca'])
  })

  it('goes into the active option’s children and back out, never above the roots', () => {
    const city = keys(open(), 'ArrowRight', 'ArrowRight')
    expect(city.highlighted).toEqual(['ca', 'on', 'tor'])
    // A leaf has nowhere to go in.
    expect(update(city, Message.Pressed({ key: 'ArrowRight' })).model).toBe(city)
    expect(keys(city, 'ArrowLeft').highlighted).toEqual(['ca', 'on'])
    const root = open()
    expect(update(root, Message.Pressed({ key: 'ArrowLeft' })).model).toBe(root)
  })

  it('moves to the next option a letter begins, wrapping, and nowhere for none', () => {
    expect(keys(open(), 'u').highlighted).toEqual(['us'])
    expect(keys(open(), 'm').highlighted).toEqual(['mx'])
    expect(keys(open(), 'M', 'm').highlighted).toEqual(['mx'])
    // A disabled option is passed over: British Columbia is not where B lands.
    const canada = keys(open(), 'ArrowRight')
    expect(update(canada, Message.Pressed({ key: 'b' })).model).toBe(canada)
    const root = open()
    expect(update(root, Message.Pressed({ key: 'z' })).model).toBe(root)
  })

  it('scrolls a row the keys reach into view, and not one the pointer is on', () => {
    expect(names(update(open(), Message.Pressed({ key: 'ArrowDown' })))).toEqual([
      'CascadeSelect.RevealItem',
    ])
    expect(names(update(open(), Message.Highlighted({ path: ['us'] })))).toEqual([])
  })

  it('chooses an option without children, closes, and gives focus back to the trigger', () => {
    const chosen = update(keys(open(), 'End'), Message.Pressed({ key: 'Enter' }))
    expect(chosen.model.value).toEqual(Option.some(['mx']))
    expect(chosen.model.open).toBe(false)
    expect(chosen.model.highlighted).toEqual([])
    expect(names(chosen)).toEqual(['CascadeSelect.FocusTrigger'])
    const city = update(open(), Message.Picked({ path: ['ca', 'qc', 'mtl'] }))
    expect(city.model.value).toEqual(Option.some(['ca', 'qc', 'mtl']))
  })

  it('on an option with children, Enter goes in and a press opens its children', () => {
    const entered = keys(open(), 'Enter', ' ')
    expect(entered.highlighted).toEqual(['ca', 'on', 'tor'])
    expect(entered.value).toEqual(Option.none())
    const pressed = update(open(), Message.Picked({ path: ['us'] })).model
    expect(pressed.highlighted).toEqual(['us'])
    expect(pressed.open).toBe(true)
    expect(pressed.value).toEqual(Option.none())
  })

  it('chooses an option with children too when parents are allowed, staying open', () => {
    const parents = CascadeSelect.update({ nodes, parents: true })
    const chosen = parents(open(), Message.Pressed({ key: 'Enter' })).model
    expect(chosen.value).toEqual(Option.some(['ca']))
    expect(chosen.open).toBe(true)
    expect(parents(open(), Message.Picked({ path: ['us'] })).model.value).toEqual(
      Option.some(['us']),
    )
  })

  it('stays open after a choice when told to', () => {
    const staying = CascadeSelect.update({ nodes, closeOnSelect: false })
    const chosen = staying(open(), Message.Picked({ path: ['mx'] }))
    expect(chosen.model.open).toBe(true)
    expect(chosen.model.value).toEqual(Option.some(['mx']))
    expect(names(chosen)).toEqual([])
  })

  it('refuses a disabled, missing or closed path', () => {
    const model = open()
    expect(update(model, Message.Picked({ path: ['ca', 'bc', 'van'] })).model).toBe(model)
    expect(update(model, Message.Picked({ path: ['ca', 'nowhere'] })).model).toBe(model)
    expect(update(model, Message.Highlighted({ path: ['ca', 'bc'] })).model).toBe(model)
    expect(update(model, Message.Highlighted({ path: [] })).model).toBe(model)
    const shut = init({ id: 'place' })
    expect(update(shut, Message.Picked({ path: ['mx'] })).model).toBe(shut)
    expect(update(shut, Message.Pressed({ key: 'ArrowDown' })).model).toBe(shut)
    expect(update(shut, Message.Closed()).model).toBe(shut)
  })

  it('drills into an option’s first enabled child', () => {
    expect(update(open(), Message.Entered({ path: ['ca'] })).model.highlighted).toEqual([
      'ca',
      'on',
    ])
    const model = open()
    expect(update(model, Message.Entered({ path: ['mx'] })).model).toBe(model)
  })

  it('closes on Escape with focus back, and when focus leaves without it', () => {
    const escaped = update(open(), Message.Pressed({ key: 'Escape' }))
    expect(escaped.model.open).toBe(false)
    expect(names(escaped)).toEqual(['CascadeSelect.FocusTrigger'])
    const left = update(open(), Message.Left())
    expect(left.model.open).toBe(false)
    expect(names(left)).toEqual([])
  })

  it('clears the value, and is the same Model with none to clear', () => {
    const cleared = update(init({ id: 'place', value: ['mx'] }), Message.Cleared())
    expect(cleared.model.value).toEqual(Option.none())
    const empty = init({ id: 'place' })
    expect(update(empty, Message.Cleared()).model).toBe(empty)
  })

  it('reads the labels along a path that names options', () => {
    expect(CascadeSelect.labelsOf(nodes, ['ca', 'on', 'tor'])).toEqual(
      Option.some(['Canada', 'Ontario', 'Toronto']),
    )
    expect(CascadeSelect.labelsOf(nodes, ['ca', 'x'])).toEqual(Option.none())
    expect(CascadeSelect.labelsOf(nodes, [])).toEqual(Option.none())
  })
})

/** The contract the package's `A11y` catalog is to hold the select to. */
const pattern = A11y.pattern({
  trigger: {
    capability: Capability.Interactive,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaExpanded],
  },
  panel: {
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.AriaExpanded],
  },
})

type Step = Parameters<typeof Scene.scene<CascadeSelect.Model, CascadeSelect.Message>>[1]

const scene = (
  model: CascadeSelect.Model,
  view: Partial<CascadeSelect.CascadeSelectView<CascadeSelect.Message>>,
  ...steps: ReadonlyArray<Step>
) =>
  Scene.scene<CascadeSelect.Model, CascadeSelect.Message>(
    {
      update,
      view: (current, h) =>
        CascadeSelect.view(
          { model: current, config, onMessage: message => message, label: 'Place', ...view },
          h,
        ),
    },
    Scene.given(model),
    ...steps,
  )

const placed = () => Scene.Mount.resolve(CascadeSelect.PlaceCascade, Message.Placed())
const revealed = () =>
  Scene.Command.resolve(CascadeSelect.RevealItem, Message.CompletedRevealItem())
const trigger = Scene.role('combobox')
const tree = Scene.role('tree')
const row = (name: string) => Scene.role('treeitem', { name })

describe('CascadeSelect.view', () => {
  it('meets its pattern', () => {
    expect(A11y.validate(pattern, CascadeSelectSlots)).toEqual([])
  })

  it('draws a closed trigger with its value, or the placeholder', () => {
    scene(
      init({ id: 'place' }),
      {},
      Scene.expect(trigger).toHaveAttr('aria-expanded', 'false'),
      Scene.expect(trigger).toHaveAttr('aria-haspopup', 'tree'),
      Scene.expect(trigger).toHaveText('Select…'),
      Scene.expect(tree).toBeAbsent(),
    )
    scene(
      init({ id: 'place', value: ['ca', 'on', 'tor'] }),
      { separator: ' › ' },
      Scene.expect(trigger).toHaveText('Canada › Ontario › Toronto'),
    )
  })

  it('opens a column per level of the path, naming the active row', () => {
    scene(
      init({ id: 'place', value: ['ca', 'on', 'ott'] }),
      { levels: ['Country', 'Region', 'City'] },
      Scene.click(trigger),
      placed(),
      Scene.expect(trigger).toHaveAttr('aria-expanded', 'true'),
      Scene.expect(Scene.role('group', { name: 'Country' })).toExist(),
      Scene.expect(Scene.role('group', { name: 'City' })).toExist(),
      Scene.expect(row('Ottawa')).toHaveAttr('aria-selected', 'true'),
      Scene.expect(row('Ottawa')).toHaveAttr('id', 'place-item-0-0-1'),
      Scene.expect(tree).toHaveAttr('aria-activedescendant', 'place-item-0-0-1'),
      Scene.expect(row('Canada')).toHaveAttr('aria-expanded', 'true'),
      Scene.expect(row('Canada')).toHaveAttr('aria-owns', 'place-level-1'),
      Scene.expect(row('United States')).toHaveAttr('aria-expanded', 'false'),
      Scene.expect(row('Mexico')).not.toHaveAttr('aria-expanded'),
      Scene.expect(row('British Columbia')).toHaveAttr('aria-disabled', 'true'),
    )
  })

  it('opens from the trigger’s keys', () => {
    scene(
      init({ id: 'place' }),
      {},
      Scene.keydown(trigger, 'ArrowDown'),
      placed(),
      Scene.expect(tree).toHaveAttr('aria-activedescendant', 'place-item-0'),
    )
  })

  it('right to left, ArrowLeft goes into the children and ArrowRight back', () => {
    scene(
      open(),
      { direction: 'rtl' },
      placed(),
      Scene.keydown(tree, 'ArrowLeft'),
      revealed(),
      Scene.expect(tree).toHaveAttr('aria-activedescendant', 'place-item-0-0'),
      Scene.keydown(tree, 'ArrowRight'),
      revealed(),
      Scene.expect(tree).toHaveAttr('aria-activedescendant', 'place-item-0'),
    )
  })

  it('opens an option’s children under the pointer, with expandOn hover', () => {
    scene(
      open(),
      { expandOn: 'hover' },
      placed(),
      Scene.hover(row('United States')),
      Scene.expect(row('Texas')).toExist(),
    )
    // Without it a row has no hover of its own to send.
    expect(() => scene(open(), {}, placed(), Scene.hover(row('United States')))).toThrow(
      /no mouseover handler/,
    )
  })

  it('drilled in, shows one level under a way back', () => {
    scene(
      open(),
      { layout: 'drill' },
      placed(),
      Scene.expect(Scene.role('group')).toExist(),
      Scene.click(row('Canada')),
      revealed(),
      Scene.expect(row('Canada')).toBeAbsent(),
      Scene.expect(row('Ontario')).toHaveAttr('aria-expanded', 'false'),
      Scene.click(Scene.selector('button:not([role])')),
      Scene.expect(row('Canada')).toExist(),
    )
  })

  it('submits the value under its name, and clears it from its button', () => {
    scene(
      init({ id: 'place', value: ['ca', 'qc', 'mtl'] }),
      { name: 'city', clearable: true },
      Scene.expect(Scene.selector('input[name="city"]')).toHaveAttr('value', 'ca/qc/mtl'),
      Scene.click(Scene.role('button', { name: 'Clear' })),
      Scene.Command.resolve(CascadeSelect.FocusTrigger, Message.CompletedFocusTrigger()),
      Scene.expect(Scene.selector('input[name="city"]')).toHaveAttr('value', ''),
      Scene.expect(Scene.role('button', { name: 'Clear' })).toBeAbsent(),
    )
  })

  it('refuses to be drawn without a name', () => {
    expect(() =>
      CascadeSelect.view(
        { model: init({ id: 'place' }), config, onMessage: () => message('Other'), label: ' ' },
        h,
      ),
    ).toThrow(/label/)
  })

  it('draws a disabled trigger that opens nothing', () => {
    scene(init({ id: 'place' }), { disabled: true }, Scene.expect(trigger).toHaveAttr('disabled'))
    expect(() =>
      scene(init({ id: 'place' }), { disabled: true }, Scene.keydown(trigger, 'ArrowDown')),
    ).toThrow(/no keydown handler/)
  })
})
