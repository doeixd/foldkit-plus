// @vitest-environment jsdom
/**
 * `Picker.view` over a placed `Bundles.Picker` and a value the application
 * owns, read through a `Choice`: both halves name what they choose, say
 * invalid and disabled, submit the choice under `name`, and draw the clear
 * button while something is chosen; the Bundle's two folds report a choice
 * made in either half as `Selected`. What the Sheet draws open, and a real
 * press, are in `pickerOptions.browser.test.ts`.
 */
import * as UiListbox from '@foldkit/ui/listbox'
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { Style } from 'foldkit-mixins'
import { Bundles, ChoiceChange, Picker, PickerSlots } from '../src/index.js'

const sorts = ['relevance', 'price', 'name'] as const
type Sort = (typeof sorts)[number]
const Sort = Picker.one(sorts)

const App = Bundle.compose({ sort: Schema.Option(Schema.Literals(sorts)) }).pipe(
  Bundle.withMessages({ Cleared: {} }),
  Bundle.withChild('box', Bundles.Picker, {
    args: { id: 'sort', animated: false },
    onOut: out => model => ({ model: { ...model, sort: Sort.picked(model.sort, out) } }),
  }),
)
type Model = typeof App.Model.Type
type Message = typeof App.Message.Type

const update = App.placements.update(model => ({
  model: { ...model, sort: Sort.picked(model.sort, ChoiceChange.ClearedSelection()) },
}))
const start = (sort?: Sort): Model =>
  App.placements.initial({ sort: Option.fromNullishOr(sort) }).model

const labels: Readonly<Record<Sort, string>> = {
  relevance: 'Most relevant',
  price: 'Lowest price',
  name: 'Name',
}

const picker =
  (more: Partial<Picker.PickerView<Sort, Option.Option<Sort>, Message>> = {}) =>
  (model: Model, h: HtmlBuilder<Message>): Html =>
    Picker.view(
      {
        model: model.box,
        onMessage: message => App.Message.GotBoxMessage({ message }),
        label: 'Sort',
        choice: Sort,
        value: model.sort,
        option: item => ({ label: labels[item] }),
        placeholder: 'Sort by',
        ...more,
      },
      h,
    )

const scene = (
  view: (model: Model, h: HtmlBuilder<Message>) => Html,
  model: Model,
  ...steps: ReadonlyArray<Parameters<typeof Scene.scene<Model, Message>>[1]>
) => Scene.scene<Model, Message>({ update, view }, Scene.given(model), ...steps)

const desk = Style.forSlots(PickerSlots)({ dropdown: Style.class('desk') })
const anchored = Scene.Mount.resolveAll(
  [UiListbox.AnchorListbox, UiListbox.Message.CompletedAnchorListbox()],
  [UiListbox.PortalListboxBackdrop, UiListbox.Message.CompletedPortalListboxBackdrop()],
)
const openedDropdown = (model: Model): Model =>
  update(
    model,
    App.Message.GotBoxMessage({
      message: Picker.Message.GotListbox({
        message: UiListbox.Message.Opened({ maybeActiveItemIndex: Option.none() }),
      }),
    }),
  ).model
const dropdown = Scene.selector('button[aria-haspopup="listbox"]')
const opener = Scene.selector('button[aria-haspopup="dialog"]')
const clears = Scene.all.selector('[aria-label="Clear"]')

describe('both halves', () => {
  it('name what they choose and what is chosen, or the placeholder', () => {
    scene(
      picker(),
      start(),
      Scene.expect(dropdown).toHaveAttr('aria-label', 'Sort: Sort by'),
      Scene.expect(opener).toHaveAttr('aria-label', 'Sort: Sort by'),
    )
    scene(
      picker(),
      start('price'),
      Scene.expect(dropdown).toHaveAttr('aria-label', 'Sort: Lowest price'),
      Scene.expect(opener).toHaveAttr('aria-label', 'Sort: Lowest price'),
    )
  })

  it('offer the `items` given, and still name a chosen item they lack', () => {
    scene(
      picker({ items: ['price', 'name'] }),
      openedDropdown(start('relevance')),
      anchored,
      Scene.expectAll(Scene.all.role('option')).toHaveCount(2),
      Scene.expect(opener).toHaveAttr('aria-label', 'Sort: Most relevant'),
      Scene.expect(dropdown).toHaveAttr('aria-label', 'Sort: Most relevant'),
    )
  })

  it('say invalid, and disabled: the opener presses nothing', () => {
    scene(
      picker({ invalid: true }),
      start(),
      Scene.expect(dropdown).toHaveAttr('aria-invalid', 'true'),
      Scene.expect(opener).toHaveAttr('aria-invalid', 'true'),
    )
    scene(
      picker({ disabled: true }),
      start(),
      Scene.expect(dropdown).toHaveAttr('aria-disabled', 'true'),
      Scene.expect(opener).toHaveAttr('aria-disabled', 'true'),
    )
  })

  it('submit the choice once, under `name`', () => {
    scene(
      picker({ name: 'sort' }),
      start('name'),
      Scene.tap<Model, Message>(({ html }) =>
        expect(
          Inert.byTag(html, 'input')
            .filter(node => Inert.value(node, 'type') === 'hidden')
            .map(node => [Inert.value(node, 'name'), Inert.value(node, 'value')]),
        ).toEqual([['sort', 'name']]),
      ),
    )
  })
})

describe('the clear button', () => {
  const clear = (more: Partial<Picker.PickerView<Sort, Option.Option<Sort>, Message>> = {}) =>
    picker({ clear: { onClear: App.Message.Cleared() }, style: desk, ...more })

  it('is drawn beside each half only while something is chosen, named by its word', () => {
    scene(clear(), start(), Scene.expectAll(clears).toHaveCount(0))
    scene(clear(), start('price'), Scene.expectAll(clears).toHaveCount(2))
    scene(
      clear({ words: { clear: 'Empty' } }),
      start('price'),
      Scene.expectAll(Scene.all.selector('[aria-label="Empty"]')).toHaveCount(2),
    )
  })

  it('is left out of a disabled picker, and empties the choice through the application’s message', () => {
    scene(clear({ disabled: true }), start('price'), Scene.expectAll(clears).toHaveCount(0))
    scene(
      clear(),
      start('price'),
      Scene.click(Scene.selector('.desk [aria-label="Clear"]')),
      Scene.expectAll(clears).toHaveCount(0),
    )
  })
})

describe('Bundles.Picker', () => {
  it('reports a choice in the dropdown and one in the Sheet as `Selected`, which `picked` folds', () => {
    const fromDropdown = update(
      start(),
      App.Message.GotBoxMessage({
        message: Picker.Message.GotListbox({
          message: UiListbox.Message.SelectedItem({ item: 'price' }),
        }),
      }),
    ).model
    expect(fromDropdown.sort).toEqual(Option.some('price'))
    const fromSheet = update(
      start(),
      App.Message.GotBoxMessage({ message: Picker.Message.ChoseInSheet({ value: 'name' }) }),
    ).model
    expect(fromSheet.sort).toEqual(Option.some('name'))
  })

  it('takes the Sheet’s animation as the arg `animated`', () => {
    expect(start().box.sheet.dialog.isAnimated).toBe(false)
  })
})
