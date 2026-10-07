// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import { Behavior, Diagnostics, Event, Style, type MixinValue } from 'foldkit-mixins'
import {
  Listbox as ListboxAdapter,
  ListboxSlots,
  ListboxView,
  type ResolvedListbox,
} from '../src/index.js'
import type { ListboxRenderInfo } from '../src/index.js'
import { classValue, holds } from './fixture.js'

const fruits = ['apple', 'banana'] as const
type Fruit = (typeof fruits)[number]
type Message = UpstreamListbox.Message
type Model = UpstreamListbox.Model

const upstream = UpstreamListbox.create<Fruit>()
const fork = ListboxView.create<Fruit>()

const openModel: Model = {
  ...UpstreamListbox.init({ id: 'test-listbox' }),
  isOpen: true,
  maybeActiveItemIndex: Option.some(0),
}

interface Captured {
  readonly render: ListboxRenderInfo
  readonly resolved: ResolvedListbox<Message>
}

type Step = Parameters<typeof Scene.scene<Model, Message, UpstreamListbox.OutMessage<Fruit>>>[1]

const runListbox = (
  mixins: ReadonlyArray<MixinValue<Message> | MixinValue<never>>,
  capture: (captured: Captured) => void,
  draw: (resolved: ResolvedListbox<Message>, h: HtmlBuilder<Message>) => Html,
  ...extra: Array<Step>
): void => {
  Scene.scene<Model, Message, UpstreamListbox.OutMessage<Fruit>>(
    {
      update: upstream.update,
      view: (model, h) =>
        fork.view(
          model,
          {
            items: [...fruits],
            itemToConfig: item => ({ content: h.span([], [item]) }),
            buttonContent: h.span([], ['open']),
            maybeSelectedValue: Option.some<Fruit>('banana'),
            toView: render => {
              const resolved = ListboxAdapter.resolve(render, mixins, {
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

/** The anchor and backdrop Mounts appear with the open panel. */
const anchored = (): Step =>
  Scene.Mount.resolveAll(
    [UpstreamListbox.AnchorListbox, UpstreamListbox.Message.CompletedAnchorListbox()],
    [
      UpstreamListbox.PortalListboxBackdrop,
      UpstreamListbox.Message.CompletedPortalListboxBackdrop(),
    ],
  )

const drawDefault = (resolved: ResolvedListbox<Message>, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...resolved.wrapper],
    [
      h.keyed('button')('test-listbox-button', [...resolved.button], [resolved.buttonContent]),
      ...resolved.hiddenInputs,
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
    ],
  )

describe('Listbox adapter', () => {
  it('preserves the base bundles by identity', () => {
    let captured: Captured | undefined
    runListbox(
      [],
      value => {
        captured = value
      },
      drawDefault,
      anchored(),
    )
    const { render, resolved } = captured!
    for (const child of render.button) expect(holds(resolved.button, child)).toBe(true)
    for (const child of render.wrapper) expect(holds(resolved.wrapper, child)).toBe(true)
    expect(resolved.groups).toHaveLength(1)
    const items = resolved.groups[0]!.items
    expect(items).toHaveLength(2)
    for (const [index, item] of items.entries()) {
      for (const child of render.groups[0]!.items[index]!.attributes) {
        expect(holds(item.attributes, child)).toBe(true)
      }
    }
  })

  it('styles the button once and every item', () => {
    const ListboxStyle = Style.forSlots(ListboxSlots)({
      button: Style.class('listbox-button'),
      item: Style.class('listbox-item'),
    })
    let captured: Captured | undefined
    runListbox(
      [ListboxStyle.mixin],
      value => {
        captured = value
      },
      drawDefault,
      anchored(),
    )
    const { resolved } = captured!
    expect(classValue(resolved.button)).toBe('listbox-button')
    for (const item of resolved.groups[0]!.items) {
      expect(classValue(item.attributes)).toBe('listbox-item')
    }
  })

  it('draws the styled bundles end to end', () => {
    const ListboxStyle = Style.forSlots(ListboxSlots)({ item: Style.class('listbox-item') })
    Scene.scene<Model, Message, UpstreamListbox.OutMessage<Fruit>>(
      {
        update: upstream.update,
        view: (model, h) =>
          fork.view(
            model,
            {
              items: [...fruits],
              itemToConfig: item => ({ content: h.span([], [item]) }),
              buttonContent: h.span([], ['open']),
              maybeSelectedValue: Option.some<Fruit>('banana'),
              toView: ListboxAdapter.toView([ListboxStyle.mixin], { h }, resolved =>
                drawDefault(resolved, h),
              ),
            },
            h,
          ),
      },
      Scene.given(openModel),
      anchored(),
      Scene.expect(Scene.selector('.listbox-item')).toExist(),
    )
  })

  it('refuses a Behavior that takes over the item click', () => {
    const Steal = Behavior.forSlots(ListboxSlots)<undefined, Message>({
      item: Behavior.slot({
        requires: { events: [Event.Click] },
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnClick(UpstreamListbox.Message.Closed()),
        ],
      }),
    })
    expect(() => runListbox([Steal.mixin], () => {}, drawDefault)).toThrow(
      Diagnostics.DiagnosticError,
    )
  })

  it('refuses a Behavior that takes over the button click', () => {
    const Steal = Behavior.forSlots(ListboxSlots)<undefined, Message>({
      button: Behavior.slot({
        requires: { events: [Event.Click] },
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnClick(UpstreamListbox.Message.Closed()),
        ],
      }),
    })
    expect(() => runListbox([Steal.mixin], () => {}, drawDefault)).toThrow(
      Diagnostics.DiagnosticError,
    )
  })
})
