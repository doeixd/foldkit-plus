// @vitest-environment jsdom
/**
 * `Listbox.view` drawn from options, over a placed `Bundles.Listbox` and a
 * value the application owns: the trigger's name and what it shows for one
 * choice and for several; the rows from `RowContent`, grouped, disabled and
 * with content of their own; the clear button; a choice the application
 * wrote, drawn through the same view; the Bundle's two folds; and the
 * application's configured Listbox. What a real press and real keys do is in
 * `listboxOptions.browser.test.ts`.
 */
import { Option, Schema } from 'effect'
import * as UiListbox from '@foldkit/ui/listbox'
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import {
  Bundles,
  ChoiceChange,
  Listbox,
  ListboxSlots,
  type Choice,
  type RowContent,
} from '../src/index.js'

const cities = ['lis', 'opo', 'fao', 'bgz'] as const
type City = (typeof cities)[number]
const names: Readonly<Record<City, string>> = {
  lis: 'Lisbon',
  opo: 'Porto',
  fao: 'Faro',
  bgz: 'Braga',
}
const One = Listbox.one(cities)
const Many = Listbox.many(cities)

/** A rule of the application's own: at most two, over the shipped `many`. */
const upToTwo = <Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => {
  const many = Listbox.many(items)
  return {
    ...many,
    picked: (value, change) => {
      const next = many.picked(value, change)
      return next.length > 2 ? value : next
    },
  }
}
const Two = upToTwo(cities)

const App = Bundle.compose({
  city: Schema.Option(Schema.Literals(cities)),
  stops: Schema.Array(Schema.Literals(cities)),
}).pipe(
  Bundle.withChild('cityBox', Bundles.Listbox, {
    args: { id: 'city' },
    onOut: out => model => ({ model: { ...model, city: One.picked(model.city, out) } }),
  }),
  Bundle.withChild('stopsBox', Bundles.Listbox, {
    args: { id: 'stops', multiple: true },
    onOut: out => model => ({ model: { ...model, stops: Two.picked(model.stops, out) } }),
  }),
)
type Model = typeof App.Model.Type
type Message = typeof App.Message.Type

const update = App.placements.update(model => ({ model }))
const start = (own: { city?: City; stops?: ReadonlyArray<City> } = {}): Model =>
  App.placements.initial({
    city: Option.fromNullishOr(own.city),
    stops: own.stops ?? [],
  }).model

const option = (item: City): RowContent => ({ label: names[item] })
type CityOptions = Partial<Listbox.ListboxView<City, Option.Option<City>, Message>>
type StopsOptions = Partial<Listbox.ListboxView<City, ReadonlyArray<City>, Message>>

const cityView =
  (more: (h: HtmlBuilder<Message>) => CityOptions = () => ({})) =>
  (model: Model, h: HtmlBuilder<Message>): Html =>
    Listbox.view(
      {
        model: model.cityBox,
        onMessage: message => App.Message.GotCityBoxMessage({ message }),
        label: 'City',
        choice: One,
        value: model.city,
        option,
        ...more(h),
      },
      h,
    )

const stopsView =
  (
    choice: Choice<City, ReadonlyArray<City>>,
    more: (h: HtmlBuilder<Message>) => StopsOptions = () => ({}),
  ) =>
  (model: Model, h: HtmlBuilder<Message>): Html =>
    Listbox.view(
      {
        model: model.stopsBox,
        onMessage: message => App.Message.GotStopsBoxMessage({ message }),
        label: 'Stops',
        choice,
        value: model.stops,
        option,
        ...more(h),
      },
      h,
    )

const scene = (
  view: (model: Model, h: HtmlBuilder<Message>) => Html,
  model: Model,
  ...steps: ReadonlyArray<Parameters<typeof Scene.scene<Model, Message>>[1]>
) => Scene.scene<Model, Message>({ update, view }, Scene.given(model), ...steps)

/** The panel's Mounts, which appear with it. */
const anchored = Scene.Mount.resolveAll(
  [UiListbox.AnchorListbox, UiListbox.Message.CompletedAnchorListbox()],
  [UiListbox.PortalListboxBackdrop, UiListbox.Message.CompletedPortalListboxBackdrop()],
)

const opened = (model: Model): Model =>
  update(
    model,
    App.Message.GotCityBoxMessage({
      message: UiListbox.Message.Opened({ maybeActiveItemIndex: Option.none() }),
    }),
  ).model

const trigger = Scene.selector('#city-button')
const rows = Scene.all.role('option')
const row = (name: string) => Scene.role('option', { name })

describe('the trigger', () => {
  it('is named by `label` and what is chosen, or the placeholder', () => {
    scene(
      cityView(() => ({ placeholder: 'Where to?' })),
      start(),
      Scene.expect(trigger).toHaveAttr('aria-label', 'City: Where to?'),
      Scene.expect(Scene.selector('#city-button [data-placeholder="true"]')).toHaveText(
        'Where to?',
      ),
    )
    scene(
      cityView(),
      start({ city: 'opo' }),
      Scene.expect(trigger).toHaveAttr('aria-label', 'City: Porto'),
      Scene.expect(Scene.selector('#city-button [data-placeholder="false"]')).toHaveText('Porto'),
    )
    // Nothing chosen and no placeholder: the label alone.
    scene(cityView(), start(), Scene.expect(trigger).toHaveAttr('aria-label', 'City'))
  })

  it('says invalid, read-only and disabled', () => {
    scene(
      cityView(() => ({ invalid: true, readOnly: true })),
      start(),
      Scene.expect(trigger).toHaveAttr('aria-invalid', 'true'),
      Scene.expect(trigger).not.toHaveAttr('aria-disabled'),
    )
    scene(
      cityView(() => ({ disabled: true })),
      start(),
      Scene.expect(trigger).toHaveAttr('aria-disabled', 'true'),
    )
  })

  it('shows the chosen row’s icon, and a drawing of the application’s own in place of the labels', () => {
    scene(
      cityView(h => ({
        option: item => ({ label: names[item], icon: h.span([h.Class('glyph')], [item]) }),
      })),
      start({ city: 'fao' }),
      Scene.expect(Scene.selector('#city-button .glyph')).toHaveText('fao'),
    )
    scene(
      stopsView(Many, h => ({
        trigger: chosen => h.span([], [`${chosen.length} stops`]),
      })),
      start({ stops: ['opo', 'lis'] }),
      Scene.expect(Scene.selector('#stops-button')).toHaveText('2 stops'),
    )
  })

  it('shows no icon for several chosen rows, which are joined by their labels', () => {
    scene(
      stopsView(Many, h => ({
        option: item => ({ label: names[item], icon: h.span([h.Class('glyph')], [item]) }),
      })),
      start({ stops: ['opo', 'lis'] }),
      Scene.expect(Scene.selector('#stops-button .glyph')).not.toExist(),
    )
  })

  it('submits each chosen item under `name`', () => {
    scene(
      cityView(() => ({ name: 'city' })),
      start({ city: 'fao' }),
      Scene.tap<Model, Message>(({ html }) =>
        expect(
          Inert.byTag(html, 'input')
            .filter(node => Inert.value(node, 'type') === 'hidden')
            .map(node => [Inert.value(node, 'name'), Inert.value(node, 'value')]),
        ).toEqual([['city', 'fao']]),
      ),
    )
  })
})

describe('the clear button', () => {
  const clear = (more: Partial<CityOptions> = {}) =>
    cityView(() => ({
      clear: { onClear: App.Message.GotCityBoxMessage({ message: UiListbox.Message.Closed() }) },
      ...more,
    }))

  it('is drawn only while something is chosen, named by its word', () => {
    scene(clear(), start(), Scene.expect(Scene.role('button', { name: 'Clear' })).not.toExist())
    scene(
      clear({ words: { clear: 'Empty the city' } }),
      start({ city: 'opo' }),
      Scene.expect(Scene.role('button', { name: 'Empty the city' })).toHaveAttr(
        'data-glyph',
        'cross',
      ),
      Scene.expect(Scene.selector('[data-clearable]')).toExist(),
    )
  })

  it('is left out of a field that is off, and has no cross when it draws a mark of its own', () => {
    scene(
      clear({ disabled: true }),
      start({ city: 'opo' }),
      Scene.expect(Scene.role('button', { name: 'Clear' })).not.toExist(),
    )
    // A read-only listbox keeps its choice, which clearing would change.
    scene(
      clear({ readOnly: true }),
      start({ city: 'opo' }),
      Scene.expect(Scene.role('button', { name: 'Clear' })).not.toExist(),
    )
    scene(
      cityView(h => ({
        clear: {
          onClear: App.Message.GotCityBoxMessage({ message: UiListbox.Message.Closed() }),
          content: h.span([h.Class('mine')], ['x']),
        },
      })),
      start({ city: 'opo' }),
      Scene.expect(Scene.role('button', { name: 'Clear' })).not.toHaveAttr('data-glyph'),
      Scene.expect(Scene.selector('.mine')).toHaveText('x'),
    )
  })

  it('sends the message it was given', () => {
    scene(
      clear(),
      opened(start({ city: 'opo' })),
      anchored,
      Scene.click(Scene.role('button', { name: 'Clear' })),
      Scene.Command.resolve(UiListbox.FocusButton, UiListbox.Message.CompletedFocusButton()),
      // `Closed` is what this fixture asks the button to send: the panel shuts.
      Scene.expect(trigger).toHaveAttr('aria-expanded', 'false'),
      Scene.Mount.expectEnded(UiListbox.AnchorListbox, UiListbox.PortalListboxBackdrop),
    )
  })
})

describe('the rows', () => {
  it('are every item of the choice, by its `RowContent`, the chosen one selected', () => {
    scene(
      cityView(),
      opened(start({ city: 'opo' })),
      anchored,
      Scene.expectAll(rows).toHaveCount(4),
      Scene.expect(row('Porto')).toHaveAttr('aria-selected', 'true'),
      Scene.expect(row('Lisbon')).toHaveAttr('aria-selected', 'false'),
    )
  })

  it('are the `items` given, where the application offers fewer, and the chosen one still shows', () => {
    scene(
      cityView(() => ({ items: ['fao', 'bgz'] })),
      opened(start({ city: 'lis' })),
      anchored,
      Scene.expectAll(rows).toHaveCount(2),
      Scene.expect(trigger).toHaveAttr('aria-label', 'City: Lisbon'),
    )
  })

  it('draw a description, an icon, a trailing part and content of their own, each in its slot', () => {
    const style = Style.forSlots(ListboxSlots)({
      itemDescription: Style.class('about'),
      itemIcon: Style.class('glyph'),
      itemTrailing: Style.class('after'),
      itemLabel: Style.class('name'),
    })
    scene(
      cityView(h => ({
        style,
        option: item => ({
          label: names[item],
          ...(item === 'lis'
            ? {
                description: 'The capital',
                icon: h.span([], ['L']),
                trailing: h.span([], ['LIS']),
              }
            : {}),
          ...(item === 'opo' ? { content: h.em([], ['Oporto']) } : {}),
        }),
      })),
      opened(start()),
      anchored,
      Scene.expect(Scene.selector('#city-item-0 .about')).toHaveText('The capital'),
      Scene.expect(Scene.selector('#city-item-0 .glyph')).toHaveText('L'),
      Scene.expect(Scene.selector('#city-item-0 .after')).toHaveText('LIS'),
      Scene.expect(Scene.selector('#city-item-0 .name')).toHaveText('Lisbon'),
      Scene.expect(Scene.selector('#city-item-2 .after')).not.toExist(),
      Scene.expect(Scene.selector('#city-item-1 .name em')).toHaveText('Oporto'),
    )
  })

  it('mark a disabled row', () => {
    scene(
      cityView(() => ({
        option: item => ({ label: names[item], disabled: item === 'fao' }),
      })),
      opened(start()),
      anchored,
      Scene.expect(row('Faro')).toHaveAttr('aria-disabled', 'true'),
      Scene.expect(row('Porto')).not.toHaveAttr('aria-disabled', 'true'),
    )
  })

  it('stand in groups, each under its heading', () => {
    const coast = (item: City) => (item === 'bgz' ? 'Inland' : 'Coast')
    scene(
      cityView(h => ({ groupBy: coast, heading: group => h.strong([], [group]) })),
      opened(start()),
      anchored,
      Scene.expectAll(Scene.all.role('group')).toHaveCount(2),
      Scene.expect(Scene.text('Inland')).toExist(),
    )
    scene(
      cityView(() => ({ groupBy: coast })),
      opened(start()),
      anchored,
      Scene.expectAll(Scene.all.role('group')).toHaveCount(2),
      Scene.expect(Scene.text('Inland')).not.toExist(),
    )
  })
})

describe('a choice of several', () => {
  it('says so on the list, joins the chosen labels on the trigger, and marks each row', () => {
    scene(
      stopsView(Many),
      start({ stops: ['opo', 'lis'] }),
      Scene.expect(Scene.selector('#stops-button')).toHaveAttr(
        'aria-label',
        'Stops: Porto, Lisbon',
      ),
      Scene.expect(Scene.selector('#stops-button [data-placeholder="false"]')).toHaveText(
        'Porto, Lisbon',
      ),
      Scene.expectAll(Scene.all.selector('input[type="hidden"]')).toHaveCount(0),
    )
  })
})

describe('Bundles.Listbox', () => {
  it('reports a choice as `Selected`, which `picked` folds', () => {
    const single = update(
      start(),
      App.Message.GotCityBoxMessage({ message: UiListbox.Message.SelectedItem({ item: 'lis' }) }),
    ).model
    expect(single.city).toEqual(Option.some('lis'))
    const several = update(
      start({ stops: ['opo'] }),
      App.Message.GotStopsBoxMessage({ message: UiListbox.Message.SelectedItem({ item: 'lis' }) }),
    ).model
    expect(several.stops).toEqual(['opo', 'lis'])
    expect(One.picked(Option.some('opo'), ChoiceChange.ClearedSelection())).toEqual(Option.none())
  })

  it('stays open after a choice of several, and closes after one', () => {
    const single = update(
      opened(start()),
      App.Message.GotCityBoxMessage({ message: UiListbox.Message.SelectedItem({ item: 'opo' }) }),
    ).model
    expect(single.cityBox.isOpen).toBe(false)
    const several = update(
      update(
        start(),
        App.Message.GotStopsBoxMessage({
          message: UiListbox.Message.Opened({ maybeActiveItemIndex: Option.none() }),
        }),
      ).model,
      App.Message.GotStopsBoxMessage({ message: UiListbox.Message.SelectedItem({ item: 'opo' }) }),
    ).model
    expect(several.stopsBox.isOpen).toBe(true)
  })
})

describe('the application’s own Listbox', () => {
  const style = Style.forSlots(ListboxSlots)({ button: Style.class('city-field') })
  const Cities = Listbox.configure({
    base: { style, words: { clear: 'Empty' } },
    presets: { prompted: { placeholder: 'Where to?' } },
  })
  const drawn =
    (preset: boolean) =>
    (model: Model, h: HtmlBuilder<Message>): Html =>
      Cities.view(
        {
          model: model.cityBox,
          onMessage: message => App.Message.GotCityBoxMessage({ message }),
          label: 'City',
          choice: One,
          value: model.city,
          option,
          clear: {
            onClear: App.Message.GotCityBoxMessage({ message: UiListbox.Message.Closed() }),
          },
          ...(preset ? { preset: 'prompted' as const } : {}),
        },
        h,
      )

  it('draws its base, the preset a use names, and the call over both', () => {
    scene(
      drawn(true),
      start(),
      Scene.expect(trigger).toHaveClass('city-field'),
      Scene.expect(trigger).toHaveAttr('aria-label', 'City: Where to?'),
    )
    scene(
      drawn(false),
      start({ city: 'opo' }),
      Scene.expect(trigger).toHaveAttr('aria-label', 'City: Porto'),
      Scene.expect(Scene.role('button', { name: 'Empty' })).toExist(),
    )
  })
})
