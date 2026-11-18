// @vitest-environment jsdom
/**
 * What `CascadeSelect` gained: its words as text (`placeholder`, `clear`,
 * `back` with `{label}`), the one `clear` option, a row's `RowContent`,
 * `triggerText`, `Set` and `helpers.set`, the inline panel, `configure`, and
 * `Bundles.CascadeSelect` with the options as its args. What a real press and
 * the keys do is in `cascadeSelect.browser.test.ts`.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Bundles, CascadeSelect, CascadeSelectSlots, type CascadeSelectView } from '../src/index.js'
import type { Config } from '../src/cascadeSelect.js'

const config: Config = {
  nodes: [
    {
      id: 'ca',
      label: 'Canada',
      children: [
        { id: 'on', label: 'Ontario', children: [{ id: 'tor', label: 'Toronto' }] },
        { id: 'qc', label: 'Quebec', children: [{ id: 'mtl', label: 'Montreal' }] },
      ],
    },
    { id: 'mx', label: 'Mexico' },
  ],
}
const { Message, init } = CascadeSelect
const update = CascadeSelect.update(config)

type Step = Parameters<typeof Scene.scene<CascadeSelect.Model, CascadeSelect.Message>>[1]
const scene = (
  model: CascadeSelect.Model,
  view:
    | Partial<CascadeSelectView<CascadeSelect.Message>>
    | ((
        h: HtmlBuilder<CascadeSelect.Message>,
      ) => Partial<CascadeSelectView<CascadeSelect.Message>>),
  settings: Config = config,
  ...steps: ReadonlyArray<Step>
) =>
  Scene.scene<CascadeSelect.Model, CascadeSelect.Message>(
    {
      update: CascadeSelect.update(settings),
      view: (current, h) =>
        CascadeSelect.view(
          {
            model: current,
            config: settings,
            onMessage: message => message,
            label: 'Place',
            ...(typeof view === 'function' ? view(h) : view),
          },
          h,
        ),
    },
    Scene.given(model),
    ...steps,
  )

const placed = Scene.Mount.resolve(CascadeSelect.PlaceCascade, Message.Placed({ cramped: false }))
const trigger = Scene.role('combobox')
const row = (name: string) => Scene.role('treeitem', { name })

describe('words', () => {
  it('say the placeholder, the clear button and the back row, and the call’s placeholder wins', () => {
    scene(
      init({ id: 'place' }),
      { words: { placeholder: 'Pick a place' } },
      config,
      Scene.expect(trigger).toHaveText('Pick a place'),
    )
    scene(
      init({ id: 'place' }),
      { placeholder: 'Anywhere', words: { placeholder: 'Pick a place' } },
      config,
      Scene.expect(trigger).toHaveText('Anywhere'),
    )
    scene(
      init({ id: 'place', value: ['ca', 'on', 'tor'] }),
      { clear: true, words: { clear: 'Forget it' } },
      config,
      Scene.expect(Scene.role('button', { name: 'Forget it' })).toExist(),
    )
    scene(
      init({ id: 'place', value: ['ca', 'on', 'tor'] }),
      { layout: 'drill', words: { back: 'Up from {label}' } },
      config,
      Scene.click(trigger),
      placed,
      Scene.expect(Scene.selector('button[aria-hidden="true"]')).toHaveText('Up from Ontario'),
    )
  })
})

describe('the clear button', () => {
  it('is drawn while there is a value, with a cross unless it holds a mark of its own', () => {
    scene(
      init({ id: 'place' }),
      { clear: true },
      config,
      Scene.expect(Scene.role('button', { name: 'Clear' })).toBeAbsent(),
    )
    scene(
      init({ id: 'place', value: ['mx'] }),
      { clear: true },
      config,
      Scene.expect(Scene.role('button', { name: 'Clear' })).toHaveAttr('data-glyph', 'cross'),
    )
    scene(
      init({ id: 'place', value: ['mx'] }),
      {},
      config,
      Scene.expect(Scene.role('button', { name: 'Clear' })).toBeAbsent(),
    )
    scene(
      init({ id: 'place', value: ['mx'] }),
      h => ({ clear: { content: h.span([h.Class('mine')], ['x']) } }),
      config,
      Scene.expect(Scene.role('button', { name: 'Clear' })).not.toHaveAttr('data-glyph'),
      Scene.expect(Scene.selector('.mine')).toHaveText('x'),
    )
  })
})

describe('rows', () => {
  const style = Style.forSlots(CascadeSelectSlots)({
    itemIcon: Style.class('glyph'),
    itemDescription: Style.class('about'),
    itemTrailing: Style.class('after'),
    itemLabel: Style.class('name'),
  })

  it('draw an icon, a description, a trailing part and content of their own, each in its slot', () => {
    scene(
      init({ id: 'place', value: ['ca', 'on', 'tor'] }),
      h => ({
        style,
        option: node => ({
          label: node.label,
          ...(node.id === 'ca'
            ? { description: 'North', icon: h.span([], ['C']), trailing: h.span([], ['CA']) }
            : {}),
        }),
      }),
      config,
      Scene.click(trigger),
      placed,
      Scene.expect(Scene.selector('#place-item-0 .about')).toHaveText('North'),
      Scene.expect(Scene.selector('#place-item-0 .glyph')).toHaveText('C'),
      Scene.expect(Scene.selector('#place-item-0 .after')).toHaveText('CA'),
      Scene.expect(Scene.selector('#place-item-0 .name')).toHaveText('Canada'),
      Scene.expect(Scene.selector('#place-item-1 .after')).toBeAbsent(),
    )
  })
})

describe('triggerText', () => {
  it('draws the trigger’s text for the labels of the chosen path', () => {
    scene(
      init({ id: 'place', value: ['ca', 'on', 'tor'] }),
      { triggerText: labels => `${labels.at(-1)} (${labels[0]})` },
      config,
      Scene.expect(trigger).toHaveText('Toronto (Canada)'),
    )
  })
})

describe('Set', () => {
  it('sets a path that can be chosen, clears with none, and ignores what cannot', () => {
    const start = init({ id: 'place' })
    const set = (model: CascadeSelect.Model, path: ReadonlyArray<string>) =>
      update(model, Message.Set({ path })).model
    const chosen = set(start, ['ca', 'on', 'tor'])
    expect(chosen.value).toEqual(Option.some(['ca', 'on', 'tor']))
    // A parent is not an option unless `parents` allows it; a stranger is no node.
    expect(set(chosen, ['ca'])).toBe(chosen)
    expect(set(chosen, ['zz'])).toBe(chosen)
    expect(set(chosen, ['ca', 'on', 'tor'])).toBe(chosen)
    expect(set(chosen, []).value).toEqual(Option.none())
    expect(set(start, [])).toBe(start)
    expect(
      CascadeSelect.update({ ...config, parents: true })(start, Message.Set({ path: ['ca'] })).model
        .value,
    ).toEqual(Option.some(['ca']))
  })

  it('ignores a path through an option that is disabled', () => {
    const fenced: Config = {
      nodes: [
        {
          id: 'ca',
          label: 'Canada',
          children: [
            {
              id: 'bc',
              label: 'BC',
              disabled: true,
              children: [{ id: 'van', label: 'Vancouver' }],
            },
          ],
        },
      ],
    }
    const start = init({ id: 'place' })
    expect(
      CascadeSelect.update(fenced)(start, Message.Set({ path: ['ca', 'bc', 'van'] })).model,
    ).toBe(start)
  })
})

describe('an inline panel', () => {
  const inline: Config = { ...config, inline: true }

  it('is the tree in place, always open, with no trigger and nothing that closes it', () => {
    scene(
      init({ id: 'place', inline: true }),
      {},
      inline,
      Scene.expect(trigger).toBeAbsent(),
      Scene.expect(Scene.role('tree')).toHaveAttr('aria-label', 'Place'),
      Scene.expect(row('Canada')).toExist(),
      Scene.keydown(Scene.role('tree'), 'Escape'),
      Scene.expect(Scene.role('tree')).toExist(),
    )
  })

  it('keeps the panel open when an option is chosen, and the Model it was given for a close', () => {
    const open = init({ id: 'place', inline: true })
    expect(open.open).toBe(true)
    const choose = CascadeSelect.update(inline)(open, Message.Picked({ path: ['mx'] }))
    expect(choose.model.open).toBe(true)
    expect(choose.model.value).toEqual(Option.some(['mx']))
    expect(CascadeSelect.update(inline)(open, Message.Closed()).model).toBe(open)
  })
})

describe('the application’s own CascadeSelect', () => {
  const Places = CascadeSelect.configure({
    base: { placeholder: 'Anywhere', words: { clear: 'Reset' }, clear: true },
    presets: { country: { levels: ['Country'] } },
  })

  it('draws its base, the preset a use names, and the call over both', () => {
    Scene.scene<CascadeSelect.Model, CascadeSelect.Message>(
      {
        update,
        view: (current, h) =>
          Places.view(
            {
              model: current,
              config,
              onMessage: message => message,
              label: 'Place',
              preset: 'country',
            },
            h,
          ),
      },
      Scene.given(init({ id: 'place', value: ['mx'] })),
      Scene.expect(Scene.role('button', { name: 'Reset' })).toExist(),
      Scene.click(trigger),
      placed,
      Scene.expect(Scene.role('group', { name: 'Country' })).toExist(),
    )
  })
})

describe('Bundles.CascadeSelect', () => {
  const Path = Schema.Option(Schema.Array(Schema.String))
  const App = Bundle.compose({ reports: Schema.Array(Path) }).pipe(
    Bundle.withChild('box', Bundles.CascadeSelect, {
      args: { id: 'place', config },
      onOut: out => model => ({ model: { ...model, reports: [...model.reports, out.value] } }),
    }),
  )
  const start = () => App.placements.initial({ reports: [] }).model
  const send = App.placements.update(model => ({ model }))

  it('reports the chosen path when it moves, and not when a pick changes nothing', () => {
    const picked = send(
      start(),
      App.Message.GotBoxMessage({ message: Message.Picked({ path: ['mx'] }) }),
    ).model
    // The select is closed, so a press on a row is not a pick.
    expect(picked.reports).toEqual([])
    const opened = send(start(), App.Message.GotBoxMessage({ message: Message.Opened() })).model
    const chosen = send(
      opened,
      App.Message.GotBoxMessage({ message: Message.Picked({ path: ['mx'] }) }),
    ).model
    expect(chosen.reports).toEqual([Option.some(['mx'])])
    expect(chosen.box.value).toEqual(Option.some(['mx']))
    // Opened again, a pick of the path already held moves nothing and reports nothing.
    const again = send(
      send(chosen, App.Message.GotBoxMessage({ message: Message.Opened() })).model,
      App.Message.GotBoxMessage({ message: Message.Picked({ path: ['mx'] }) }),
    ).model
    expect(again.reports).toEqual([Option.some(['mx'])])
  })

  it('takes the starting value and the inline option from its args', () => {
    const Held = Bundle.compose({}).pipe(
      Bundle.withChild('box', Bundles.CascadeSelect, {
        args: { id: 'held', value: ['ca', 'qc', 'mtl'], config: { ...config, inline: true } },
        onOut: Bundle.ignore,
      }),
    )
    const { box } = Held.placements.initial({}).model
    expect(box.value).toEqual(Option.some(['ca', 'qc', 'mtl']))
    expect(box.open).toBe(true)
  })

  it('has `helpers.set`, which reports nothing', () => {
    expect(App.children.box.helpers.set(['ca', 'on', 'tor'])(start()).model.box.value).toEqual(
      Option.some(['ca', 'on', 'tor']),
    )
  })
})
