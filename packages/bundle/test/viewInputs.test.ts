/**
 * A placement's `viewInputs`: the child's view is drawn with inputs the
 * parent's Model adds to the ones its view gave, at every draw.
 */
import { Schema } from 'effect'
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { describe, expect, it } from 'vitest'
import { Bundle } from '../src/index.js'

const ToggleModel = Schema.Struct({ on: Schema.Boolean })
type ToggleModel = typeof ToggleModel.Type
const ToggleMessage = defineMessageUnion({ Flipped: {} })
type ToggleMessage = typeof ToggleMessage.Type
interface Inputs {
  readonly label: string
  readonly busy?: boolean | undefined
}

const Toggle = Bundle.make('Toggle', {
  Model: ToggleModel,
  Message: ToggleMessage,
  init: () => ({ model: { on: false } }),
  update: model => ({ model: { on: !model.on } }),
}).pipe(
  Bundle.withView(
    Submodel.defineView<ToggleModel, ToggleMessage, Inputs>((model, inputs, h) =>
      h.button([], [`${inputs.label}${inputs.busy === true ? ' (busy)' : ''}`]),
    ),
  ),
)
const Slot = Bundle.declare(Toggle, 'toggle')
const Model = Schema.Struct({ ...Slot.fields, saving: Schema.Boolean })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const textOf = (html: Html): string =>
  (html as { readonly children?: ReadonlyArray<{ readonly text?: string }> }).children?.[0]?.text ??
  ''
/**
 * A builder whose `submodel` draws the child inert, as a runtime frame would
 * with the inputs it is handed: `h.submodel` itself needs a running runtime.
 */
const drawing = <M>(): HtmlBuilder<M> =>
  ({
    ...inertHtml,
    // As Foldkit's: inputs go positionally whenever the key is there, so a view
    // that takes none and is handed some gets them where its builder belongs.
    submodel: (config: {
      readonly model: unknown
      readonly view: (model: unknown, ...rest: ReadonlyArray<unknown>) => Html
      readonly viewInputs?: unknown
    }) =>
      Object.hasOwn(config, 'viewInputs')
        ? config.view(config.model, config.viewInputs, inertHtml)
        : config.view(config.model, inertHtml),
  }) as unknown as HtmlBuilder<M>
const h = drawing<Message>()

describe('A placement’s viewInputs', () => {
  it('adds what the parent holds to the inputs given, at every draw', () => {
    const Placed = Page.at(Slot, {
      viewInputs: (parent, given) => ({ ...given, busy: parent.saving }),
    })
    const idle: Model = { toggle: { on: false }, saving: false }
    expect(textOf(Placed.view(idle, h, { label: 'Save' }))).toBe('Save')
    expect(textOf(Placed.view({ ...idle, saving: true }, h, { label: 'Save' }))).toBe('Save (busy)')
  })

  it('hands back the inputs the child’s view takes', () => {
    Page.at(Slot, {
      // @ts-expect-error the view takes a label, which this leaves out
      viewInputs: () => ({ busy: true }),
    })
  })

  it('gives a view that takes no inputs none, and does not ask for them', () => {
    const Plain = Bundle.declare(
      Bundle.make('Plain', {
        Model: ToggleModel,
        Message: ToggleMessage,
        init: () => ({ model: { on: false } }),
        update: model => ({ model }),
      }).pipe(
        Bundle.withView(
          Submodel.defineView<ToggleModel, ToggleMessage>((model, h) =>
            h.button([], [model.on ? 'on' : 'off']),
          ),
        ),
      ),
      'toggle',
    )
    let asked = 0
    const Placed = Page.at(Plain, {
      // @ts-expect-error the view takes no inputs, so this would never be called
      viewInputs: (_: Model, given: void) => {
        asked += 1
        return given
      },
    })
    expect(textOf(Placed.view({ toggle: { on: true }, saving: true }, h))).toBe('on')
    expect(asked).toBe(0)
  })

  it('is taken for a bundle with no view, whose form the page draws itself', () => {
    const Headless = Bundle.declare(
      Bundle.make('Headless', {
        Model: ToggleModel,
        Message: ToggleMessage,
        init: () => ({ model: { on: false } }),
        update: model => ({ model }),
      }),
      'toggle',
    )
    const Placed = Page.at(Headless, { viewInputs: (_, given) => given })
    expect(Placed.view({ toggle: { on: true }, saving: true }, h)).toBeNull()
  })

  it('draws with the inputs given when there is none', () => {
    const Placed = Page.at(Slot)
    const saving: Model = { toggle: { on: false }, saving: true }
    expect(textOf(Placed.view(saving, h, { label: 'Save' }))).toBe('Save')
  })

  it('is taken by Bundle.configure', () => {
    const Composed = Bundle.compose({ saving: Schema.Boolean }).pipe(
      Bundle.withChild('toggle', Toggle),
    )
    const Configured = Composed.pipe(
      Bundle.configure('toggle', {
        viewInputs: (parent, given) => ({
          ...given,
          busy: parent.saving,
        }),
      }),
    )
    const drawn = Configured.children.toggle.view(
      { toggle: { on: false }, saving: true },
      drawing<typeof Configured.Message.Type>(),
      { label: 'Save' },
    )
    expect(textOf(drawn)).toBe('Save (busy)')
  })
})
