// @vitest-environment jsdom
/**
 * The forked listbox views draw what upstream draws. Every battery below
 * runs the identical Scene program against upstream's views and the forks
 * (default `toView`), so a fork that drifts in markup, bundles, or event
 * wiring fails here. Behavior is upstream's in all scenes; only the views
 * differ. Fork-only tests at the end prove the seam and both selection
 * flows (single closes, multi stays open).
 */
import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import {
  Multi as ForkMulti,
  create as createFork,
  defaultToView,
  type ListboxRenderInfo,
} from '../src/listboxView.js'

const fruits = ['apple', 'banana', 'cherry'] as const
type Fruit = (typeof fruits)[number]
type Message = UpstreamListbox.Message
type SingleModel = UpstreamListbox.Model
type MultiModel = UpstreamListbox.Multi.Model

const upstreamSingle = UpstreamListbox.create<Fruit>()
const forkSingle = createFork<Fruit>()
const upstreamMulti = UpstreamListbox.Multi.create<Fruit>()
const forkMulti = ForkMulti.create<Fruit>()

const id = 'l'
const button = `#${id}-button`
const panel = `#${id}-items`
const item = (index: number) => `#${id}-item-${index}`

const singleModel = (overrides: Partial<SingleModel> = {}): SingleModel => ({
  ...UpstreamListbox.init({ id }),
  ...overrides,
})

const multiModel = (overrides: Partial<MultiModel> = {}): MultiModel => ({
  ...UpstreamListbox.Multi.init({ id }),
  ...overrides,
})

const openSingle = (index: Option.Option<number> = Option.some(0)): SingleModel =>
  singleModel({ isOpen: true, maybeActiveItemIndex: index })

const openMulti = (index: Option.Option<number> = Option.some(0)): MultiModel =>
  multiModel({ isOpen: true, maybeActiveItemIndex: index })

type SingleStep = Parameters<
  typeof Scene.scene<SingleModel, Message, UpstreamListbox.OutMessage<Fruit>>
>[1]
type MultiStep = Parameters<
  typeof Scene.scene<MultiModel, Message, UpstreamListbox.OutMessage<Fruit>>
>[1]

const singleInputs = (h: HtmlBuilder<Message>) => ({
  items: [...fruits],
  itemToConfig: (item: Fruit) => ({ content: h.span([], [item]) }),
  buttonContent: h.span([], ['open']),
  maybeSelectedValue: Option.some<Fruit>('banana'),
})

const multiInputs = (h: HtmlBuilder<Message>) => ({
  items: [...fruits],
  itemToConfig: (item: Fruit) => ({ content: h.span([], [item]) }),
  buttonContent: h.span([], ['open']),
  selectedValues: ['banana' as Fruit],
})

/** The same program against the single views: upstream's, then the fork's. */
const runBothSingle = (initial: SingleModel, ...steps: Array<SingleStep>): void => {
  for (const view of [upstreamSingle.view, forkSingle.view]) {
    Scene.scene<SingleModel, Message, UpstreamListbox.OutMessage<Fruit>>(
      {
        update: upstreamSingle.update,
        view: (current, h) => view(current, singleInputs(h), h),
      },
      Scene.given(initial),
      ...steps,
    )
  }
}

/** The same program against the multi views: upstream's, then the fork's. */
const runBothMulti = (initial: MultiModel, ...steps: Array<MultiStep>): void => {
  for (const view of [upstreamMulti.view, forkMulti.view]) {
    Scene.scene<MultiModel, Message, UpstreamListbox.OutMessage<Fruit>>(
      {
        update: upstreamMulti.update,
        view: (current, h) => view(current, multiInputs(h), h),
      },
      Scene.given(initial),
      ...steps,
    )
  }
}

/** The anchor and backdrop Mounts appear with the panel. */
const anchoredSingle = (): SingleStep =>
  Scene.Mount.resolveAll(
    [UpstreamListbox.AnchorListbox, UpstreamListbox.Message.CompletedAnchorListbox()],
    [
      UpstreamListbox.PortalListboxBackdrop,
      UpstreamListbox.Message.CompletedPortalListboxBackdrop(),
    ],
  )
const anchoredMulti = (): MultiStep =>
  Scene.Mount.resolveAll(
    [UpstreamListbox.AnchorListbox, UpstreamListbox.Message.CompletedAnchorListbox()],
    [
      UpstreamListbox.PortalListboxBackdrop,
      UpstreamListbox.Message.CompletedPortalListboxBackdrop(),
    ],
  )
const expectExpanded = (expanded: boolean): SingleStep =>
  Scene.expect(Scene.selector(button)).toHaveAttr('aria-expanded', String(expanded))

describe('listbox view parity (upstream views vs forked views)', () => {
  it('closed single: collapsed button, no panel', () => {
    runBothSingle(
      singleModel(),
      expectExpanded(false),
      Scene.expect(Scene.selector(button)).toHaveAttr('aria-haspopup', 'listbox'),
      Scene.expect(Scene.selector(panel)).toBeAbsent(),
    )
  })

  it('open single: listbox panel, active item, selection shown', () => {
    runBothSingle(
      openSingle(),
      anchoredSingle(),
      Scene.expect(Scene.selector(panel)).toHaveAttr('role', 'listbox'),
      Scene.expect(Scene.selector(panel)).toHaveAttr('aria-activedescendant', `${id}-item-0`),
      Scene.expect(Scene.selector(item(1))).toHaveAttr('role', 'option'),
      Scene.expect(Scene.selector(item(1))).toHaveAttr('aria-selected', 'true'),
      Scene.expect(Scene.selector(item(1))).toHaveAttr('data-selected', ''),
      Scene.expect(Scene.selector(item(0))).toHaveAttr('aria-selected', 'false'),
    )
  })

  it('open multi: multiselectable panel, selection shown, no active requirement', () => {
    runBothMulti(
      openMulti(Option.none()),
      anchoredMulti(),
      Scene.expect(Scene.selector(panel)).toHaveAttr('role', 'listbox'),
      Scene.expect(Scene.selector(panel)).toHaveAttr('aria-multiselectable', 'true'),
      Scene.expect(Scene.selector(item(1))).toHaveAttr('aria-selected', 'true'),
    )
  })

  it('disabled items are marked', () => {
    const disabled = (initial: SingleModel): void => {
      for (const view of [upstreamSingle.view, forkSingle.view]) {
        Scene.scene<SingleModel, Message, UpstreamListbox.OutMessage<Fruit>>(
          {
            update: upstreamSingle.update,
            view: (current, h) =>
              view(current, { ...singleInputs(h), isItemDisabled: item => item === 'banana' }, h),
          },
          Scene.given(initial),
          anchoredSingle(),
          Scene.expect(Scene.selector(item(1))).toHaveAttr('aria-disabled', 'true'),
        )
      }
    }
    disabled(openSingle())
  })

  it('readonly panels expose readonly semantics', () => {
    const readonly = (initial: SingleModel): void => {
      for (const view of [upstreamSingle.view, forkSingle.view]) {
        Scene.scene<SingleModel, Message, UpstreamListbox.OutMessage<Fruit>>(
          {
            update: upstreamSingle.update,
            view: (current, h) => view(current, { ...singleInputs(h), isReadOnly: true }, h),
          },
          Scene.given(initial),
          anchoredSingle(),
          Scene.expect(Scene.selector(panel)).toHaveAttr('aria-readonly', 'true'),
          Scene.expect(Scene.selector(item(0))).toHaveAttr('data-readonly', ''),
        )
      }
    }
    readonly(openSingle())
  })

  it('named selections render hidden form inputs', () => {
    const named = (initial: SingleModel): void => {
      for (const view of [upstreamSingle.view, forkSingle.view]) {
        Scene.scene<SingleModel, Message, UpstreamListbox.OutMessage<Fruit>>(
          {
            update: upstreamSingle.update,
            view: (current, h) => view(current, { ...singleInputs(h), name: 'fruit' }, h),
          },
          Scene.given(initial),
          anchoredSingle(),
          Scene.expect(Scene.selector('input[name="fruit"]')).toHaveAttr('value', 'banana'),
        )
      }
    }
    named(openSingle())
  })

  it('grouped: group roles, headings, separators', () => {
    const grouped = (initial: SingleModel): void => {
      for (const view of [upstreamSingle.view, forkSingle.view]) {
        Scene.scene<SingleModel, Message, UpstreamListbox.OutMessage<Fruit>>(
          {
            update: upstreamSingle.update,
            view: (current, h) =>
              view(
                current,
                {
                  ...singleInputs(h),
                  itemGroupKey: item => (item === 'banana' ? 'b' : 'a'),
                  groupToHeading: key => ({ content: h.span([], [`group-${key}`]) }),
                  separatorClassName: 'sep',
                },
                h,
              ),
          },
          Scene.given(initial),
          anchoredSingle(),
          Scene.expect(Scene.selector('[role="group"]')).toHaveAttr(
            'aria-labelledby',
            `${id}-heading-a`,
          ),
          Scene.expect(Scene.selector(`#${id}-heading-b`)).toHaveAttr('role', 'presentation'),
          Scene.expect(Scene.selector('[role="separator"]')).toHaveAttr('class', 'sep'),
        )
      }
    }
    grouped(openSingle())
  })
})

describe('forked listbox seam', () => {
  it('a custom toView receives the computed bundles', () => {
    let seen: ListboxRenderInfo | undefined
    Scene.scene<SingleModel, Message, UpstreamListbox.OutMessage<Fruit>>(
      {
        update: upstreamSingle.update,
        view: (current, h) =>
          forkSingle.view(
            current,
            {
              ...singleInputs(h),
              toView: render => {
                seen = render
                return defaultToView(h)(render)
              },
            },
            h,
          ),
      },
      Scene.given(openSingle()),
      anchoredSingle(),
    )
    const render = seen!
    expect(render.isVisible).toBe(true)
    expect(render.backdrop).toBeDefined()
    expect(render.items).toBeDefined()
    expect(render.groups).toHaveLength(1)
    expect(render.groups[0]!.items).toHaveLength(3)
    expect(render.hiddenInputs).toEqual([])
  })

  it('single pointer-select closes with the value', () => {
    Scene.scene<SingleModel, Message, UpstreamListbox.OutMessage<Fruit>>(
      {
        update: upstreamSingle.update,
        view: (current, h) => forkSingle.view(current, singleInputs(h), h),
      },
      Scene.given(singleModel()),
      Scene.pointerDown(button),
      Scene.expectHandled(),
      Scene.Command.resolve(
        UpstreamListbox.FocusItems,
        UpstreamListbox.Message.CompletedFocusItems(),
      ),
      anchoredSingle(),
      Scene.click(item(1)),
      Scene.expectOutMessage<UpstreamListbox.OutMessage<Fruit>>({
        _tag: 'Selected',
        value: 'banana',
      }),
      Scene.Command.resolve(
        UpstreamListbox.FocusButton,
        UpstreamListbox.Message.CompletedFocusButton(),
      ),
      Scene.Mount.expectEnded(UpstreamListbox.AnchorListbox, UpstreamListbox.PortalListboxBackdrop),
      expectExpanded(false),
    )
  })

  it('multi click selects and stays open', () => {
    Scene.scene<MultiModel, Message, UpstreamListbox.OutMessage<Fruit>>(
      {
        update: upstreamMulti.update,
        view: (current, h) => forkMulti.view(current, multiInputs(h), h),
      },
      Scene.given(multiModel()),
      Scene.pointerDown(button),
      Scene.expectHandled(),
      Scene.Command.resolve(
        UpstreamListbox.FocusItems,
        UpstreamListbox.Message.CompletedFocusItems(),
      ),
      anchoredMulti(),
      Scene.click(item(0)),
      Scene.expectOutMessage<UpstreamListbox.OutMessage<Fruit>>({
        _tag: 'Selected',
        value: 'apple',
      }),
      Scene.expect(Scene.selector(panel)).toExist(),
    )
  })
})
