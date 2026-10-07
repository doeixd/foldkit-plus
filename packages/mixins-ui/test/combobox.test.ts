// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import { Behavior, Diagnostics, Event, Style, type MixinValue } from 'foldkit-mixins'
import {
  Combobox as ComboboxAdapter,
  ComboboxSlots,
  ComboboxView,
  type ResolvedCombobox,
} from '../src/index.js'
import type { ComboboxRenderInfo } from '../src/index.js'
import { classValue, holds } from './fixture.js'

const fruits = ['apple', 'banana'] as const
type Fruit = (typeof fruits)[number]
type Message = UpstreamCombobox.Message
type Model = UpstreamCombobox.Model

const upstream = UpstreamCombobox.create<Fruit>()
const fork = ComboboxView.create<Fruit>()

const openModel: Model = {
  ...UpstreamCombobox.init({ id: 'test-combobox' }),
  isOpen: true,
  maybeActiveItemIndex: Option.some(0),
}

interface Captured {
  readonly render: ComboboxRenderInfo
  readonly resolved: ResolvedCombobox<Message>
}

type Step = Parameters<typeof Scene.scene<Model, Message, UpstreamCombobox.OutMessage<Fruit>>>[1]

const inputsOf = (h: HtmlBuilder<Message>) => ({
  items: [...fruits],
  restingInputValue: '',
  itemToConfig: (item: Fruit) => ({ content: h.span([], [item]) }),
  itemToValue: (item: Fruit) => item,
  itemToDisplayText: (item: Fruit) => item,
  buttonContent: h.span([], ['v']),
  maybeSelectedValue: Option.some<Fruit>('banana'),
})

const runCombobox = (
  mixins: ReadonlyArray<MixinValue<Message> | MixinValue<never>>,
  capture: (captured: Captured) => void,
  draw: (resolved: ResolvedCombobox<Message>, h: HtmlBuilder<Message>) => Html,
  ...extra: Array<Step>
): void => {
  Scene.scene<Model, Message, UpstreamCombobox.OutMessage<Fruit>>(
    {
      update: upstream.update,
      view: (model, h) =>
        fork.view(
          model,
          {
            ...inputsOf(h),
            toView: render => {
              const resolved = ComboboxAdapter.resolve(render, mixins, {
                input: undefined,
                h,
              })
              capture({ render, resolved })
              return draw(resolved, h)
            },
          },
          h,
        ),
    },
    Scene.given(openModel),
    ...extra,
  )
}

/** The anchor, backdrop, and blur-guard Mounts appear with the open panel. */
const anchored = (): Step =>
  Scene.Mount.resolveAll(
    [UpstreamCombobox.AnchorCombobox, UpstreamCombobox.Message.CompletedAnchorCombobox()],
    [
      UpstreamCombobox.PortalComboboxBackdrop,
      UpstreamCombobox.Message.CompletedPortalComboboxBackdrop(),
    ],
    [
      UpstreamCombobox.AttachComboboxPreventBlur,
      UpstreamCombobox.Message.CompletedAttachComboboxPreventBlur(),
    ],
  )

const drawDefault = (resolved: ResolvedCombobox<Message>, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...resolved.wrapper],
    [
      h.div(
        [...resolved.inputWrapper],
        [
          h.input([...resolved.input]),
          ...(resolved.toggleButton === undefined
            ? []
            : [
                h.keyed('button')(
                  resolved.toggleButton.key,
                  [...resolved.toggleButton.attributes],
                  [resolved.toggleButton.content],
                ),
              ]),
        ],
      ),
      ...(resolved.backdrop === undefined
        ? []
        : [h.keyed('div')(resolved.backdrop.key, [...resolved.backdrop.attributes])]),
      ...(resolved.items === undefined
        ? []
        : [
            h.keyed('div')(
              resolved.items.key,
              [...resolved.items.attributes],
              resolved.groups.flatMap(group =>
                group.items.map(item =>
                  h.keyed('div')(item.key, [...item.attributes], [item.content]),
                ),
              ),
            ),
          ]),
      ...resolved.hiddenInputs,
    ],
  )

describe('Combobox adapter', () => {
  it('preserves the base bundles by identity', () => {
    let captured: Captured | undefined
    runCombobox(
      [],
      value => {
        captured = value
      },
      drawDefault,
      anchored(),
    )
    const { render, resolved } = captured!
    for (const child of render.input) expect(holds(resolved.input, child)).toBe(true)
    for (const child of render.inputWrapper) {
      expect(holds(resolved.inputWrapper, child)).toBe(true)
    }
    expect(resolved.groups).toHaveLength(1)
    const items = resolved.groups[0]!.items
    expect(items).toHaveLength(2)
    for (const [index, item] of items.entries()) {
      for (const child of render.groups[0]!.items[index]!.attributes) {
        expect(holds(item.attributes, child)).toBe(true)
      }
    }
  })

  it('styles the input once and every item', () => {
    const ComboboxStyle = Style.forSlots(ComboboxSlots)({
      input: Style.class('combo-input'),
      item: Style.class('combo-item'),
    })
    let captured: Captured | undefined
    runCombobox(
      [ComboboxStyle.mixin],
      value => {
        captured = value
      },
      drawDefault,
      anchored(),
    )
    const { resolved } = captured!
    expect(classValue(resolved.input)).toBe('combo-input')
    for (const item of resolved.groups[0]!.items) {
      expect(classValue(item.attributes)).toBe('combo-item')
    }
  })

  it('draws the styled bundles end to end', () => {
    const ComboboxStyle = Style.forSlots(ComboboxSlots)({ item: Style.class('combo-item') })
    Scene.scene<Model, Message, UpstreamCombobox.OutMessage<Fruit>>(
      {
        update: upstream.update,
        view: (model, h) =>
          fork.view(
            model,
            {
              ...inputsOf(h),
              toView: ComboboxAdapter.toView([ComboboxStyle.mixin], { h }, resolved =>
                drawDefault(resolved, h),
              ),
            },
            h,
          ),
      },
      Scene.given(openModel),
      anchored(),
      Scene.expect(Scene.selector('.combo-item')).toExist(),
    )
  })

  it('refuses a Behavior that takes over the item click', () => {
    const Steal = Behavior.forSlots(ComboboxSlots)<undefined, Message>({
      item: Behavior.slot({
        requires: { events: [Event.Click] },
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnClick(UpstreamCombobox.Message.SuppressedItemCommit()),
        ],
      }),
    })
    expect(() => runCombobox([Steal.mixin], () => {}, drawDefault)).toThrow(
      Diagnostics.DiagnosticError,
    )
  })

  it('refuses a Behavior that takes over the input keydown', () => {
    const Steal = Behavior.forSlots(ComboboxSlots)<undefined, Message>({
      input: Behavior.slot({
        requires: { events: [Event.KeyDown] },
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnKeyDownPreventDefault(() => Option.none()),
        ],
      }),
    })
    expect(() => runCombobox([Steal.mixin], () => {}, drawDefault)).toThrow(
      Diagnostics.DiagnosticError,
    )
  })
})
