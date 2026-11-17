/**
 * `Bundles.X` placed as an application places them: the widget's state in a
 * field the application names, its Messages routed by the placement, and,
 * for a Combobox, the application's own value folded through a `Choice`.
 * Written as an application's code, so nothing here casts.
 */
import { Option, Schema } from 'effect'
import * as UiCombobox from '@foldkit/ui/combobox'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Bundles, Combobox, FileUpload, TagsInput, type Choice } from '../src/index.js'

const cities = ['Lisbon', 'Porto', 'Faro', 'Braga'] as const
const City = Combobox.one(cities)
const Suggest = Combobox.text(cities)

/** A rule of the application's own: at most three, over the shipped `many`. */
const upToThree = <Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => {
  const many = Combobox.many(items)
  return {
    ...many,
    picked: (value, change) => {
      const next = many.picked(value, change)
      return next.length > 3 ? value : next
    },
  }
}
const Stops = upToThree(cities)

const App = Bundle.compose({
  city: Schema.Option(Schema.Literals(cities)),
  typed: Schema.String,
  stops: Schema.Array(Schema.Literals(cities)),
}).pipe(
  Bundle.withChild('labels', Bundles.TagsInput, {
    args: { id: 'labels', tags: ['urgent'], max: 2 },
  }),
  Bundle.withChild('cityBox', Bundles.Combobox, {
    args: { id: 'city' },
    onOut: out => model => ({ model: { ...model, city: City.picked(model.city, out) } }),
  }),
  Bundle.withChild('typedBox', Bundles.Combobox, {
    args: { id: 'typed', nullable: true },
    onOut: out => model => ({ model: { ...model, typed: Suggest.picked(model.typed, out) } }),
  }),
  Bundle.withChild('stopsBox', Bundles.Combobox, {
    args: { id: 'stops', multiple: true },
    onOut: out => model => ({ model: { ...model, stops: Stops.picked(model.stops, out) } }),
  }),
)
type Model = typeof App.Model.Type

/**
 * Exported so this project's declaration emit has to name every type in a
 * composition of shipped Bundles: it failed with TS4023 while `foldkit-bundle`
 * kept the composition's record of a child to itself.
 */
export const Exported = App

const update = App.placements.update(model => ({ model }))
const start = (): Model =>
  App.placements.initial({ city: Option.none(), typed: '', stops: [] }).model

const select = (item: string) =>
  UiCombobox.Message.SelectedItem({ item, displayText: item, wasSelected: false })
const opened = UiCombobox.Message.Opened({ maybeActiveItemIndex: Option.none() })

describe('Bundles.TagsInput', () => {
  const tag = (model: Model, text: string): Model => {
    const typed = update(
      model,
      App.Message.GotLabelsMessage({ message: TagsInput.Message.Typed({ text, drawn: 0 }) }),
    ).model
    return update(typed, App.Message.GotLabelsMessage({ message: TagsInput.Message.Committed() }))
      .model
  }

  it('starts from its args, in the field the application named', () => {
    expect(start().labels).toEqual(TagsInput.init({ id: 'labels', tags: ['urgent'], max: 2 }))
  })

  it('folds its Messages through the placement, holding to its `max`', () => {
    const two = tag(start(), 'design')
    expect(two.labels.tags).toEqual(['urgent', 'design'])
    expect(tag(two, 'late').labels.tags).toEqual(['urgent', 'design'])
  })
})

describe('Bundles.Combobox', () => {
  const send = (model: Model, message: typeof App.Message.Type): Model =>
    update(model, message).model

  it('starts closed under its id, with upstream’s defaults for what the args leave out', () => {
    expect(start().cityBox).toEqual(UiCombobox.init({ id: 'city' }))
    expect(start().typedBox.nullable).toBe(true)
  })

  it('starts showing the `text` given, for a value chosen before the page drew', () => {
    const Chosen = Bundle.compose({}).pipe(
      Bundle.withChild('box', Bundles.Combobox, {
        args: { id: 'box', text: 'Porto' },
        onOut: Bundle.ignore,
      }),
    )
    expect(Chosen.placements.initial({}).model.box).toEqual({
      ...UiCombobox.init({ id: 'box' }),
      inputValue: 'Porto',
    })
  })

  it('spells upstream’s `isAnimated` and `isModal` as `animated` and `modal`', () => {
    const Modal = Bundle.compose({}).pipe(
      Bundle.withChild('box', Bundles.Combobox, {
        args: { id: 'box', animated: true, modal: true },
        onOut: Bundle.ignore,
      }),
    )
    expect(Modal.placements.initial({}).model.box).toEqual(
      UiCombobox.init({ id: 'box', isAnimated: true, isModal: true }),
    )
  })

  it('reports a choice, which the application folds into its own field', () => {
    const chosen = send(start(), App.Message.GotCityBoxMessage({ message: select('Porto') }))
    expect(chosen.city).toEqual(Option.some('Porto'))
    // A value that is no item leaves the field as it was.
    expect(send(chosen, App.Message.GotCityBoxMessage({ message: select('Madrid') })).city).toBe(
      chosen.city,
    )
  })

  it('closes on a choice of one, and stays open on a choice of several', () => {
    const one = send(
      send(start(), App.Message.GotCityBoxMessage({ message: opened })),
      App.Message.GotCityBoxMessage({ message: select('Porto') }),
    )
    expect(one.cityBox.isOpen).toBe(false)
    const several = send(
      send(start(), App.Message.GotStopsBoxMessage({ message: opened })),
      App.Message.GotStopsBoxMessage({ message: select('Porto') }),
    )
    expect(several.stopsBox.isOpen).toBe(true)
    expect(several.stops).toEqual(['Porto'])
  })

  it('reports the typed text, which only a value that is the text follows', () => {
    const typing = (value: string) => UiCombobox.Message.UpdatedInputValue({ value })
    const typed = send(start(), App.Message.GotTypedBoxMessage({ message: typing('Lis') }))
    expect(typed.typed).toBe('Lis')
    expect(typed.typedBox.inputValue).toBe('Lis')
    const other = send(start(), App.Message.GotCityBoxMessage({ message: typing('Lis') }))
    expect(other.city).toEqual(Option.none())
    expect(send(typed, App.Message.GotTypedBoxMessage({ message: select('Lisbon') })).typed).toBe(
      'Lisbon',
    )
  })

  it('folds through a choice the application wrote: no fourth stop', () => {
    const pick = (model: Model, item: string) =>
      send(model, App.Message.GotStopsBoxMessage({ message: select(item) }))
    const three = ['Lisbon', 'Porto', 'Faro'].reduce(pick, start())
    expect(three.stops).toEqual(['Lisbon', 'Porto', 'Faro'])
    expect(pick(three, 'Braga').stops).toBe(three.stops)
    expect(pick(three, 'Porto').stops).toEqual(['Lisbon', 'Faro'])
  })
})

describe('Bundles.FileUpload', () => {
  const args = {
    id: 'files',
    multiple: true,
    accept: ['.txt'],
    maxSize: 100,
    maxFiles: 3,
    previews: false,
    lanes: 1,
    initial: [{ id: 'kept', name: 'kept.txt', size: 4, type: 'text/plain', url: '/kept.txt' }],
  }
  const Upload = Bundle.compose({ added: Schema.Array(Schema.String) }).pipe(
    Bundle.withChild('files', Bundles.FileUpload, {
      args,
      onOut: out => model => ({
        model: {
          ...model,
          added: FileUpload.OutMessage.match(out, {
            Picked: ({ added }) => [...model.added, ...added],
            Removed: () => model.added,
          }),
        },
      }),
    }),
  )
  const begin = () => Upload.placements.initial({ added: [] }).model
  const offer = (names: ReadonlyArray<string>) =>
    Upload.Message.GotFilesMessage({
      message: FileUpload.Message.Offered({
        files: names.map(name => new File(['text'], name, { type: 'text/plain' })),
        by: 'drop',
      }),
    })

  it('starts from every arg, in the field the application named', () => {
    expect(begin().files).toEqual(FileUpload.init(args))
  })

  it('folds an offer by its limits, and reports what it listed to the parent', () => {
    const next = Upload.placements.update()(begin(), offer(['a.txt', 'b.png']))
    expect(next.model.files.entries.map(entry => entry.name)).toEqual(['kept.txt', 'a.txt'])
    expect(next.model.files.refusals).toEqual([FileUpload.Refusal.Kind({ name: 'b.png' })])
    expect(next.model.added).toEqual(['local-1'])
  })
})
