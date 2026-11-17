// @vitest-environment jsdom
/**
 * `Combobox.view` drawn from options, over a placed `Bundles.Combobox` and a
 * value the application owns: the field's name, resting text and states; the
 * rows from `RowContent`, filtered by the typed text and grouped; the chosen
 * rows marked for one and for several; chips and the clear button; a choice
 * the application wrote, drawn through the same view; and the application's
 * configured Combobox. What a real press and real typing do is in
 * `comboboxOptions.browser.test.ts`.
 */
import { Option, Schema } from 'effect'
import * as UiCombobox from '@foldkit/ui/combobox'
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { Bundles, Combobox, ComboboxSlots, type Choice, type RowContent } from '../src/index.js'

const cities = ['lis', 'opo', 'fao', 'bgz'] as const
type City = (typeof cities)[number]
const names: Readonly<Record<City, string>> = {
  lis: 'Lisbon',
  opo: 'Porto',
  fao: 'Faro',
  bgz: 'Braga',
}
const One = Combobox.one(cities)
const Many = Combobox.many(cities)

/** A rule of the application's own: at most two, over the shipped `many`. */
const upToTwo = <Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => {
  const many = Combobox.many(items)
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
  Bundle.withChild('cityBox', Bundles.Combobox, {
    args: { id: 'city' },
    onOut: out => model => ({ model: { ...model, city: One.picked(model.city, out) } }),
  }),
  Bundle.withChild('stopsBox', Bundles.Combobox, {
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
type CityOptions = Partial<Combobox.ComboboxView<City, Option.Option<City>, Message>>
type StopsOptions = Partial<Combobox.ComboboxView<City, ReadonlyArray<City>, Message>>

const cityView =
  (more: (h: HtmlBuilder<Message>) => CityOptions = () => ({})) =>
  (model: Model, h: HtmlBuilder<Message>): Html =>
    Combobox.view(
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
  (choice: Choice<City, ReadonlyArray<City>>, more: StopsOptions = {}) =>
  (model: Model, h: HtmlBuilder<Message>): Html =>
    Combobox.view(
      {
        model: model.stopsBox,
        onMessage: message => App.Message.GotStopsBoxMessage({ message }),
        label: 'Stops',
        choice,
        value: model.stops,
        option,
        chips: true,
        ...more,
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
  [UiCombobox.AnchorCombobox, UiCombobox.Message.CompletedAnchorCombobox()],
  [UiCombobox.PortalComboboxBackdrop, UiCombobox.Message.CompletedPortalComboboxBackdrop()],
)
/** The clear button's own Mount: a press on it leaves the field its focus. */
const keepsFocus = Scene.Mount.resolve(
  UiCombobox.AttachComboboxPreventBlur,
  UiCombobox.Message.CompletedAttachComboboxPreventBlur(),
)

const opened = (model: Model, typed = ''): Model => {
  const open = update(
    model,
    App.Message.GotCityBoxMessage({
      message: UiCombobox.Message.Opened({ maybeActiveItemIndex: Option.none() }),
    }),
  ).model
  return typed === ''
    ? open
    : update(
        open,
        App.Message.GotCityBoxMessage({
          message: UiCombobox.Message.UpdatedInputValue({ value: typed }),
        }),
      ).model
}

const input = Scene.role('combobox')
const rows = Scene.all.role('option')
const row = (name: string) => Scene.role('option', { name })

describe('the field', () => {
  it('is named by `label`, and shows the text typed', () => {
    scene(
      cityView(),
      opened(start({ city: 'opo' }), 'zz'),
      anchored,
      Scene.expect(input).toHaveAttr('aria-label', 'City'),
      Scene.expect(input).toHaveAttr('value', 'zz'),
    )
  })

  it('takes a placeholder, and says disabled, invalid and read-only', () => {
    scene(
      cityView(() => ({ placeholder: 'Where to?', invalid: true, readOnly: true })),
      start(),
      Scene.expect(input).toHaveAttr('placeholder', 'Where to?'),
      Scene.expect(input).toHaveAttr('aria-invalid', 'true'),
      Scene.expect(input).toHaveAttr('aria-readonly', 'true'),
      Scene.expect(input).not.toHaveAttr('aria-disabled'),
    )
    scene(
      cityView(() => ({ disabled: true })),
      start(),
      Scene.expect(input).toHaveAttr('aria-disabled', 'true'),
    )
  })

  it('submits the chosen item under `name`', () => {
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

  it('draws the clear button only while the field holds text, named by its word', () => {
    scene(
      cityView(() => ({ clear: true })),
      start(),
      Scene.expect(Scene.role('button', { name: 'Clear' })).not.toExist(),
    )
    scene(
      cityView(() => ({ clear: true, words: { clear: 'Empty the city' } })),
      opened(start(), 'li'),
      anchored,
      keepsFocus,
      Scene.expect(Scene.role('button', { name: 'Empty the city' })).toHaveAttr(
        'data-glyph',
        'cross',
      ),
    )
  })

  it('draws a clear mark of the application’s own in place of the cross', () => {
    scene(
      cityView(h => ({ clear: { content: h.span([h.Class('mine')], ['x']) } })),
      opened(start(), 'li'),
      anchored,
      keepsFocus,
      Scene.expect(Scene.role('button', { name: 'Clear' })).not.toHaveAttr('data-glyph'),
      Scene.expect(Scene.selector('.mine')).toHaveText('x'),
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

  it('stay only where the filter keeps their label for the typed text', () => {
    scene(
      cityView(() => ({ filter: Combobox.contains })),
      opened(start(), 'R'),
      anchored,
      Scene.expectAll(rows).toHaveCount(3),
      Scene.expect(row('Lisbon')).not.toExist(),
    )
    scene(
      cityView(() => ({ filter: Combobox.startsWith })),
      opened(start(), 'b'),
      anchored,
      Scene.expectAll(rows).toHaveCount(1),
      Scene.expect(row('Braga')).toExist(),
    )
    // No filter offers every row, as a list fetched for the text needs.
    scene(cityView(), opened(start(), 'zzz'), anchored, Scene.expectAll(rows).toHaveCount(4))
  })

  it('are the `items` given, where the application offers fewer', () => {
    scene(
      cityView(() => ({ items: ['fao', 'bgz'] })),
      opened(start()),
      anchored,
      Scene.expectAll(rows).toHaveCount(2),
      Scene.expect(row('Faro')).toExist(),
    )
  })

  it('draw a description, an icon, a trailing part and content of their own, each in its slot', () => {
    const style = Style.forSlots(ComboboxSlots)({
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
      // Content of its own is drawn where the label's text was; the label still names the field.
      Scene.expect(Scene.selector('#city-item-1 .name em')).toHaveText('Oporto'),
    )
  })

  it('mark a disabled row, which takes no press', () => {
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
      cityView(h => ({
        groupBy: coast,
        heading: group => h.strong([], [group]),
      })),
      opened(start()),
      anchored,
      Scene.expectAll(Scene.all.role('group')).toHaveCount(2),
      Scene.expect(Scene.text('Inland')).toExist(),
      Scene.expect(Scene.text('Coast')).toExist(),
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
  it('says so on the list, draws each chosen item as a chip, and rests empty', () => {
    scene(
      stopsView(Many),
      start({ stops: ['opo', 'lis'] }),
      Scene.expect(Scene.role('combobox')).toHaveAttr('value', ''),
      Scene.expect(Scene.role('button', { name: 'Remove Porto' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Remove Lisbon' })).toExist(),
      Scene.expectAll(Scene.all.selector('input[type="hidden"]')).toHaveCount(0),
    )
    scene(
      stopsView(Many, { chips: false }),
      start({ stops: ['opo'] }),
      Scene.expect(Scene.role('button', { name: 'Remove Porto' })).not.toExist(),
    )
  })

  it('names a chip’s remove button by its word', () => {
    scene(
      stopsView(Many, { words: { remove: 'Drop {label}' } }),
      start({ stops: ['opo'] }),
      Scene.expect(Scene.role('button', { name: 'Drop Porto' })).toExist(),
    )
  })

  it('takes a chip’s press as a choice, which the application’s own rule folds', () => {
    scene(
      stopsView(Two),
      start({ stops: ['opo', 'lis'] }),
      Scene.click(Scene.role('button', { name: 'Remove Porto' })),
      Scene.expect(Scene.role('button', { name: 'Remove Porto' })).not.toExist(),
      Scene.expect(Scene.role('button', { name: 'Remove Lisbon' })).toExist(),
    )
  })
})

describe('the application’s own Combobox', () => {
  const style = Style.forSlots(ComboboxSlots)({ input: Style.class('city-field') })
  const Cities = Combobox.configure({
    base: { style, filter: Combobox.contains, words: { clear: 'Empty' } },
    presets: { clearable: { clear: true, placeholder: 'Where to?' } },
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
          ...(preset ? { preset: 'clearable' as const } : {}),
        },
        h,
      )

  it('draws its base, the preset a use names, and the call over both', () => {
    scene(
      drawn(true),
      opened(start(), 'r'),
      anchored,
      keepsFocus,
      Scene.expect(input).toHaveClass('city-field'),
      Scene.expect(input).toHaveAttr('placeholder', 'Where to?'),
      Scene.expectAll(rows).toHaveCount(3),
      Scene.expect(Scene.role('button', { name: 'Empty' })).toExist(),
    )
    scene(
      drawn(false),
      opened(start(), 'r'),
      anchored,
      Scene.expect(input).not.toHaveAttr('placeholder'),
      Scene.expect(Scene.role('button', { name: 'Empty' })).not.toExist(),
    )
  })
})
