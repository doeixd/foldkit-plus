// @vitest-environment jsdom
/**
 * The forked combobox views draw what upstream draws. Every battery below
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
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import {
  Multi as ForkMulti,
  create as createFork,
  defaultToView,
  type ComboboxRenderInfo,
} from '../src/comboboxView.js'

const fruits = ['apple', 'banana', 'cherry'] as const
type Fruit = (typeof fruits)[number]
type Message = UpstreamCombobox.Message
type SingleModel = UpstreamCombobox.Model
type MultiModel = UpstreamCombobox.Multi.Model

const upstreamSingle = UpstreamCombobox.create<Fruit>()
const forkSingle = createFork<Fruit>()
const upstreamMulti = UpstreamCombobox.Multi.create<Fruit>()
const forkMulti = ForkMulti.create<Fruit>()

const id = 'c'
const input = `#${id}-input`
const panel = `#${id}-items`
const item = (index: number) => `#${id}-item-${index}`

const singleModel = (overrides: Partial<SingleModel> = {}): SingleModel => ({
  ...UpstreamCombobox.init({ id }),
  ...overrides,
})

const multiModel = (overrides: Partial<MultiModel> = {}): MultiModel => ({
  ...UpstreamCombobox.Multi.init({ id }),
  ...overrides,
})

const openSingle = (index: Option.Option<number> = Option.some(0)): SingleModel =>
  singleModel({ isOpen: true, maybeActiveItemIndex: index })

const openMulti = (index: Option.Option<number> = Option.some(0)): MultiModel =>
  multiModel({ isOpen: true, maybeActiveItemIndex: index })

type SingleStep = Parameters<
  typeof Scene.scene<SingleModel, Message, UpstreamCombobox.OutMessage<Fruit>>
>[1]
type MultiStep = Parameters<
  typeof Scene.scene<MultiModel, Message, UpstreamCombobox.OutMessage<Fruit>>
>[1]

const singleInputs = (h: HtmlBuilder<Message>) => ({
  items: [...fruits],
  restingInputValue: '',
  itemToConfig: (item: Fruit) => ({ content: h.span([], [item]) }),
  itemToValue: (item: Fruit) => item,
  itemToDisplayText: (item: Fruit) => item,
  buttonContent: h.span([], ['v']),
  maybeSelectedValue: Option.some<Fruit>('banana'),
})

const multiInputs = (h: HtmlBuilder<Message>) => ({
  items: [...fruits],
  restingInputValue: '',
  itemToConfig: (item: Fruit) => ({ content: h.span([], [item]) }),
  itemToValue: (item: Fruit) => item,
  itemToDisplayText: (item: Fruit) => item,
  buttonContent: h.span([], ['v']),
  selectedValues: ['banana' as Fruit],
})

const preventBlur = (): SingleStep =>
  Scene.Mount.resolve(
    UpstreamCombobox.AttachComboboxPreventBlur,
    UpstreamCombobox.Message.CompletedAttachComboboxPreventBlur(),
  )

/** The same program against the single views: upstream's, then the fork's. */
const runBothSingle = (initial: SingleModel, ...steps: Array<SingleStep>): void => {
  for (const view of [upstreamSingle.view, forkSingle.view]) {
    Scene.scene<SingleModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
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
    Scene.scene<MultiModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
      {
        update: upstreamMulti.update,
        view: (current, h) => view(current, multiInputs(h), h),
      },
      Scene.given(initial),
      ...steps,
    )
  }
}

/** The anchor, backdrop, and blur-guard Mounts appear with the panel. */
const anchoredSingle = (): SingleStep =>
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
const anchoredMulti = (): MultiStep =>
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

/** Anchor and backdrop only, for scenes that already resolved the toggle's blur guard. */
const anchoredPanel = (): SingleStep =>
  Scene.Mount.resolveAll(
    [UpstreamCombobox.AnchorCombobox, UpstreamCombobox.Message.CompletedAnchorCombobox()],
    [
      UpstreamCombobox.PortalComboboxBackdrop,
      UpstreamCombobox.Message.CompletedPortalComboboxBackdrop(),
    ],
  )
const expectExpanded = (expanded: boolean): SingleStep =>
  Scene.expect(Scene.selector(input)).toHaveAttr('aria-expanded', String(expanded))

describe('combobox view parity (upstream views vs forked views)', () => {
  it('closed single: collapsed input, no panel', () => {
    runBothSingle(
      singleModel(),
      Scene.Mount.resolve(
        UpstreamCombobox.AttachComboboxPreventBlur,
        UpstreamCombobox.Message.CompletedAttachComboboxPreventBlur(),
      ),
      expectExpanded(false),
      Scene.expect(Scene.selector(input)).toHaveAttr('role', 'combobox'),
      Scene.expect(Scene.selector(panel)).toBeAbsent(),
    )
  })

  it('open single: listbox panel, active item on the input, selection shown', () => {
    runBothSingle(
      openSingle(),
      anchoredSingle(),
      expectExpanded(true),
      Scene.expect(Scene.selector(panel)).toHaveAttr('role', 'listbox'),
      Scene.expect(Scene.selector(input)).toHaveAttr('aria-activedescendant', `${id}-item-0`),
      Scene.expect(Scene.selector(item(1))).toHaveAttr('role', 'option'),
      Scene.expect(Scene.selector(item(1))).toHaveAttr('aria-selected', 'true'),
      Scene.expect(Scene.selector(item(1))).toHaveAttr('data-selected', ''),
      Scene.expect(Scene.selector(item(0))).toHaveAttr('aria-selected', 'false'),
    )
  })

  it('open multi: multiselectable panel with the selection shown', () => {
    runBothMulti(
      openMulti(Option.none()),
      anchoredMulti(),
      expectExpanded(true),
      Scene.expect(Scene.selector(panel)).toHaveAttr('aria-multiselectable', 'true'),
      Scene.expect(Scene.selector(item(1))).toHaveAttr('aria-selected', 'true'),
    )
  })

  it('typing filters through the input value', () => {
    runBothSingle(
      singleModel(),
      preventBlur(),
      Scene.type(input, 'ba'),
      anchoredPanel(),
      Scene.expect(Scene.selector(input)).toHaveValue('ba'),
    )
  })

  it('disabled comboboxes drop their handlers', () => {
    const disabled = (initial: SingleModel): void => {
      for (const view of [upstreamSingle.view, forkSingle.view]) {
        Scene.scene<SingleModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
          {
            update: upstreamSingle.update,
            view: (current, h) => view(current, { ...singleInputs(h), isDisabled: true }, h),
          },
          Scene.given(initial),
          Scene.Mount.resolve(
            UpstreamCombobox.AttachComboboxPreventBlur,
            UpstreamCombobox.Message.CompletedAttachComboboxPreventBlur(),
          ),
          Scene.expect(Scene.selector(input)).toHaveAttr('aria-disabled', 'true'),
          Scene.expect(Scene.selector(panel)).toBeAbsent(),
        )
      }
    }
    disabled(singleModel())
  })

  it('grouped: group roles, headings, separators', () => {
    const grouped = (initial: SingleModel): void => {
      for (const view of [upstreamSingle.view, forkSingle.view]) {
        Scene.scene<SingleModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
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

describe('forked combobox seam', () => {
  it('a custom toView receives the computed bundles', () => {
    let seen: ComboboxRenderInfo | undefined
    Scene.scene<SingleModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
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
    expect(render.toggleButton).toBeDefined()
    expect(render.groups).toHaveLength(1)
    expect(render.groups[0]!.items).toHaveLength(3)
  })

  it('single enter-select closes with the value', () => {
    Scene.scene<SingleModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
      {
        update: upstreamSingle.update,
        view: (current, h) => forkSingle.view(current, singleInputs(h), h),
      },
      Scene.given(openSingle(Option.some(1))),
      anchoredSingle(),
      Scene.keydown(input, 'Enter'),
      Scene.expectHandled(),
      Scene.Command.resolve(
        UpstreamCombobox.ClickItem,
        UpstreamCombobox.Message.CompletedClickItem(),
      ),
      Scene.click(item(1)),
      Scene.expectOutMessage<UpstreamCombobox.OutMessage<Fruit>>({
        _tag: 'Selected',
        value: 'banana',
      }),
      Scene.Command.resolve(
        UpstreamCombobox.FocusInput,
        UpstreamCombobox.Message.CompletedFocusInput(),
      ),
      Scene.Mount.expectEnded(
        UpstreamCombobox.AnchorCombobox,
        UpstreamCombobox.PortalComboboxBackdrop,
      ),
      expectExpanded(false),
    )
  })

  it('multi click selects and stays open', () => {
    Scene.scene<MultiModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
      {
        update: upstreamMulti.update,
        view: (current, h) => forkMulti.view(current, multiInputs(h), h),
      },
      Scene.given(openMulti(Option.some(0))),
      anchoredMulti(),
      Scene.click(item(2)),
      Scene.expectOutMessage<UpstreamCombobox.OutMessage<Fruit>>({
        _tag: 'Selected',
        value: 'cherry',
      }),
      Scene.expect(Scene.selector(panel)).toExist(),
    )
  })
})
