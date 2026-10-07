// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as UpstreamMenu from '@foldkit/ui/menu'
import { Behavior, Diagnostics, Event, Style, type MixinValue } from 'foldkit-mixins'
import {
  Menu as MenuAdapter,
  MenuSlots,
  MenuView,
  type MenuRenderInfo,
  type ResolvedMenu,
} from '../src/index.js'
import { classValue, holds } from './fixture.js'

const fruits = ['apple', 'banana'] as const
type Fruit = (typeof fruits)[number]
type Message = UpstreamMenu.Message

const upstream = UpstreamMenu.create<Fruit>()
const fork = MenuView.create<Fruit>()

const openModel: UpstreamMenu.Model = {
  ...UpstreamMenu.init({ id: 'test-menu' }),
  isOpen: true,
  maybeActiveItemIndex: Option.some(0),
}

interface Captured {
  readonly render: MenuRenderInfo
  readonly resolved: ResolvedMenu<Message>
}

/**
 * The fork publishes plain attribute bundles (plus mount ChildAttributes),
 * which resolve without a frame; `Scene.scene` still supplies the frame the
 * fork's `h` needs, as the upstream-adapter tests do.
 */
type Step = Parameters<
  typeof Scene.scene<UpstreamMenu.Model, Message, UpstreamMenu.OutMessage<Fruit>>
>[1]

const runMenu = (
  mixins: ReadonlyArray<MixinValue<Message> | MixinValue<never>>,
  capture: (captured: Captured) => void,
  draw: (resolved: ResolvedMenu<Message>, h: HtmlBuilder<Message>) => Html,
  ...extra: Array<Step>
): void => {
  Scene.scene<UpstreamMenu.Model, Message, UpstreamMenu.OutMessage<Fruit>>(
    {
      update: upstream.update,
      view: (model, h) =>
        fork.view(
          model,
          {
            items: [...fruits],
            itemToConfig: item => ({ content: h.span([], [item]) }),
            buttonContent: h.span([], ['open']),
            toView: render => {
              const resolved = MenuAdapter.resolve(render, mixins, {
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
    [UpstreamMenu.AnchorMenu, UpstreamMenu.Message.CompletedAnchorMenu()],
    [UpstreamMenu.PortalMenuBackdrop, UpstreamMenu.Message.CompletedPortalMenuBackdrop()],
  )

const drawDefault = (resolved: ResolvedMenu<Message>, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...resolved.wrapper],
    [
      h.keyed('button')('test-menu-button', [...resolved.button], [resolved.buttonContent]),
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

describe('Menu adapter', () => {
  it('preserves the base bundles by identity', () => {
    let captured: Captured | undefined
    runMenu(
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
    const MenuStyle = Style.forSlots(MenuSlots)({
      wrapper: Style.class('menu'),
      button: Style.class('menu-button'),
      backdrop: Style.class('menu-backdrop'),
      item: Style.class('menu-item'),
    })
    let captured: Captured | undefined
    runMenu(
      [MenuStyle.mixin],
      value => {
        captured = value
      },
      drawDefault,
      anchored(),
    )
    const { resolved } = captured!
    expect(classValue(resolved.wrapper)).toBe('menu')
    expect(classValue(resolved.button)).toBe('menu-button')
    expect(classValue(resolved.backdrop!.attributes)).toBe('menu-backdrop')
    for (const item of resolved.groups[0]!.items) {
      expect(classValue(item.attributes)).toBe('menu-item')
    }
  })

  it('draws the styled bundles end to end', () => {
    const MenuStyle = Style.forSlots(MenuSlots)({ item: Style.class('menu-item') })
    Scene.scene<UpstreamMenu.Model, Message, UpstreamMenu.OutMessage<Fruit>>(
      {
        update: upstream.update,
        view: (model, h) =>
          fork.view(
            model,
            {
              items: [...fruits],
              itemToConfig: item => ({ content: h.span([], [item]) }),
              buttonContent: h.span([], ['open']),
              toView: MenuAdapter.toView([MenuStyle.mixin], { h }, resolved =>
                drawDefault(resolved, h),
              ),
            },
            h,
          ),
      },
      Scene.given(openModel),
      anchored(),
      Scene.expect(Scene.selector('.menu-item')).toExist(),
    )
  })

  it('refuses a Behavior that takes over the item click', () => {
    const Steal = Behavior.forSlots(MenuSlots)<undefined, Message>({
      item: Behavior.slot({
        requires: { events: [Event.Click] },
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnClick(UpstreamMenu.Message.Closed()),
        ],
      }),
    })
    expect(() => runMenu([Steal.mixin], () => {}, drawDefault)).toThrow(Diagnostics.DiagnosticError)
  })

  it('refuses a Behavior that takes over the button click', () => {
    const Steal = Behavior.forSlots(MenuSlots)<undefined, Message>({
      button: Behavior.slot({
        requires: { events: [Event.Click] },
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnClick(UpstreamMenu.Message.Closed()),
        ],
      }),
    })
    expect(() => runMenu([Steal.mixin], () => {}, drawDefault)).toThrow(Diagnostics.DiagnosticError)
  })
})
