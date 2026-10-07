// @vitest-environment jsdom
/**
 * The forked toast view draws what upstream draws. Every battery below runs
 * the identical Scene program against `@foldkit/ui/toast`'s view and the
 * fork (default `toView`), so a fork that drifts in markup, bundles, or
 * event wiring fails here. Behavior is upstream's in both scenes; only the
 * view differs. Fork-only tests at the end prove the seam and the dismiss
 * wiring.
 */
import { describe, expect, it } from 'vitest'
import { Schema } from 'effect'
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import * as Animation from '@foldkit/ui/animation'
import * as UpstreamToast from '@foldkit/ui/toast'
import { make as makeForkView, type ToastRenderInfo } from '../src/toastView.js'

const Payload = Schema.Struct({ text: Schema.String })

const upstream = UpstreamToast.make(Payload)
const fork = makeForkView(Payload)

type Model = typeof upstream.Model.Type
type Message = typeof upstream.Message.Type
type OutMessage = typeof upstream.OutMessage.Type

const id = 't'

const withEntries = (): Model => {
  const empty = upstream.init({ id })
  const first = upstream.show(empty, {
    payload: { text: 'hello' },
    variant: 'Info',
    sticky: true,
  })
  const second = upstream.show(first.model, {
    payload: { text: 'boom' },
    variant: 'Error',
    sticky: true,
  })
  return second.model
}

const entryId = (model: Model, index: number): string => model.entries[index]!.id

type Step = Parameters<typeof Scene.scene<Model, Message, OutMessage>>[1]

const inputsOf = (h: HtmlBuilder<Message>) => ({
  position: 'BottomRight' as const,
  entryToView: (
    entry: Model['entries'][number],
    handlers: { dismiss: Parameters<HtmlBuilder<Message>['button']>[0] },
  ) => h.div([], [h.span([], [entry.payload.text]), h.button([...handlers.dismiss], ['x'])]),
})

/** The same program against both views: upstream's, then the fork's. */
const runBoth = (model: Model, ...steps: Array<Step>): void => {
  for (const view of [upstream.view, fork.view]) {
    Scene.scene<Model, Message, OutMessage>(
      {
        update: upstream.update,
        view: (current, h) => view(current, inputsOf(h), h),
      },
      Scene.given(model),
      ...steps,
    )
  }
}

describe('toast view parity (upstream view vs forked view)', () => {
  it('empty: live region, no entries', () => {
    runBoth(
      upstream.init({ id }),
      Scene.expect(Scene.selector(`#${id}`)).toHaveAttr('role', 'region'),
      Scene.expect(Scene.selector(`#${id}`)).toHaveAttr('aria-live', 'polite'),
      Scene.expect(Scene.selector(`#${id}`)).toHaveAttr('aria-label', 'Notifications'),
    )
  })

  it('entries: roles, variants, payload text', () => {
    const model = withEntries()
    runBoth(
      model,
      Scene.expect(Scene.selector(`#${entryId(model, 0)}`)).toHaveAttr('role', 'status'),
      Scene.expect(Scene.selector(`#${entryId(model, 0)}`)).toHaveAttr(
        'data-variant',
        'Info',
      ),
      Scene.expect(Scene.selector(`#${entryId(model, 1)}`)).toHaveAttr('role', 'alert'),
      Scene.expect(Scene.selector(`#${entryId(model, 1)}`)).toHaveAttr(
        'data-variant',
        'Error',
      ),
      Scene.expect(Scene.selector(`#${entryId(model, 0)}`)).toHaveText(/hello/),
      Scene.expect(Scene.selector(`#${entryId(model, 1)}`)).toHaveText(/boom/),
    )
  })

  it('container and entry classes plus custom label', () => {
    const model = withEntries()
    for (const view of [upstream.view, fork.view]) {
      Scene.scene<Model, Message, OutMessage>(
        {
          update: upstream.update,
          view: (current, h) =>
            view(
              current,
              {
                ...inputsOf(h),
                ariaLabel: 'Alerts',
                containerClassName: 'toasts',
                entryClassName: 'toast',
              },
              h,
            ),
        },
        Scene.given(model),
        Scene.expect(Scene.selector(`#${id}`)).toHaveAttr('aria-label', 'Alerts'),
        Scene.expect(Scene.selector(`#${id}`)).toHaveClass('toasts'),
        Scene.expect(Scene.selector(`#${entryId(model, 0)}`)).toHaveClass('toast'),
      )
    }
  })
})

describe('forked toast seam', () => {
  it('a custom toView receives the computed bundles', () => {
    const model = withEntries()
    let seen: ToastRenderInfo | undefined
    Scene.scene<Model, Message, OutMessage>(
      {
        update: upstream.update,
        view: (current, h) =>
          fork.view(
            current,
            {
              ...inputsOf(h),
              toView: render => {
                seen = render
                return h.div([], ['custom'])
              },
            },
            h,
          ),
      },
      Scene.given(model),
    )
    const render = seen!
    expect(render.id).toBe(id)
    expect(render.container.length).toBeGreaterThan(0)
    expect(render.entries).toHaveLength(2)
    expect(render.entries[0]!.id).toBe(entryId(model, 0))
  })

  it('dismissing through the forked view starts the leave and removes the entry', () => {
    const model = withEntries()
    const first = entryId(model, 0)
    const second = entryId(model, 1)
    const entered = { generation: 1 }
    const left = { generation: 2 }
    Scene.scene<Model, Message, OutMessage>(
      {
        update: upstream.update,
        view: (current, h) => fork.view(current, inputsOf(h), h),
      },
      Scene.given(model),
      Scene.Command.resolveAll(
        [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint(entered)],
        [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint(entered)],
        [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation(entered)],
        [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation(entered)],
      ),
      Scene.click(`#${first} button`),
      Scene.expect(Scene.selector(`#${first}`)).toHaveAttr('data-leave', ''),
      Scene.Command.resolveAll(
        [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint(left)],
        [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation(left)],
      ),
      Scene.expectOutMessage(upstream.DismissedToast({ payload: { text: 'hello' } })),
      Scene.expect(Scene.selector(`#${first}`)).toBeAbsent(),
      Scene.expect(Scene.selector(`#${second}`)).toExist(),
    )
  })
})
