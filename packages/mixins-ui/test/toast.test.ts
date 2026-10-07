// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Schema } from 'effect'
import { Scene } from 'foldkit/test'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Animation from '@foldkit/ui/animation'
import * as UpstreamToast from '@foldkit/ui/toast'
import { Behavior, Diagnostics, Style, type MixinValue } from 'foldkit-mixins'
import {
  Toast as ToastAdapter,
  ToastSlots,
  ToastView,
  type ResolvedToast,
  type ToastRenderInfo,
} from '../src/index.js'
import { classValue, holds } from './fixture.js'

const Payload = Schema.Struct({ text: Schema.String })
const upstream = UpstreamToast.make(Payload)
const fork = ToastView.make(Payload)

type Model = typeof upstream.Model.Type
type Message = typeof upstream.Message.Type
type OutMessage = typeof upstream.OutMessage.Type

const id = 't'

const model = upstream.show(upstream.init({ id }), {
  payload: { text: 'hello' },
  variant: 'Info',
  sticky: true,
}).model

const entryId = model.entries[0]!.id

type Step = Parameters<typeof Scene.scene<Model, Message, OutMessage>>[1]

interface Captured {
  readonly render: ToastRenderInfo
  readonly resolved: ResolvedToast<Message>
}

const runToast = (
  mixins: ReadonlyArray<MixinValue<Message> | MixinValue<never>>,
  capture: (captured: Captured) => void,
  draw: (resolved: ResolvedToast<Message>, h: HtmlBuilder<Message>) => Html,
  ...extra: Array<Step>
): void => {
  Scene.scene<Model, Message, OutMessage>(
    {
      update: upstream.update,
      view: (current, h) =>
        fork.view(
          current,
          {
            position: 'BottomRight',
            entryToView: entry => h.div([], [entry.payload.text]),
            toView: render => {
              const resolved = ToastAdapter.resolve(render, mixins, {
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
    Scene.given(model),
    ...extra,
  )
}

const drawDefault = (resolved: ResolvedToast<Message>, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    resolved.id,
    [...resolved.container],
    resolved.entries.map(entry => h.keyed('div')(entry.id, [...entry.attributes], [entry.content])),
  )

describe('Toast adapter', () => {
  it('preserves the base bundles by identity', () => {
    let captured: Captured | undefined
    runToast(
      [],
      value => {
        captured = value
      },
      drawDefault,
    )
    const { render, resolved } = captured!
    for (const child of render.container) expect(holds(resolved.container, child)).toBe(true)
    expect(resolved.entries).toHaveLength(1)
    for (const child of render.entries[0]!.attributes) {
      expect(holds(resolved.entries[0]!.attributes, child)).toBe(true)
    }
  })

  it('styles the container and every entry', () => {
    const ToastStyle = Style.forSlots(ToastSlots)({
      container: Style.class('toasts'),
      entry: Style.class('toast'),
    })
    let captured: Captured | undefined
    runToast(
      [ToastStyle.mixin],
      value => {
        captured = value
      },
      drawDefault,
    )
    const { resolved } = captured!
    expect(classValue(resolved.container)).toBe('toasts')
    for (const entry of resolved.entries) {
      expect(classValue(entry.attributes)).toBe('toast')
    }
  })

  it('draws the styled bundles end to end', () => {
    const ToastStyle = Style.forSlots(ToastSlots)({ entry: Style.class('toast') })
    Scene.scene<Model, Message, OutMessage>(
      {
        update: upstream.update,
        view: (current, h) =>
          fork.view(
            current,
            {
              position: 'BottomRight',
              entryToView: entry => h.div([], [entry.payload.text]),
              toView: ToastAdapter.toView([ToastStyle.mixin], { h }, resolved =>
                drawDefault(resolved, h),
              ),
            },
            h,
          ),
      },
      Scene.given(model),
      Scene.expect(Scene.selector('.toast')).toExist(),
    )
  })

  it('refuses a Behavior that adds a second mouseenter owner', () => {
    const Steal = Behavior.forSlots(ToastSlots)<undefined, Message>({
      entry: Behavior.slot({
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnMouseEnter(upstream.Message.Dismissed({ entryId })),
        ],
      }),
    })
    expect(() => runToast([Steal.mixin], () => {}, drawDefault)).toThrow(
      Diagnostics.DiagnosticError,
    )
  })
})
