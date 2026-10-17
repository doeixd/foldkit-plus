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
  type MultiViewInputs,
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

  it('draws the panel for the top layer only when the anchor stays in place', () => {
    Scene.scene<SingleModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
      {
        update: upstreamSingle.update,
        view: (current, h) => forkSingle.view(current, singleInputs(h), h),
      },
      Scene.given(openSingle()),
      anchoredSingle(),
      Scene.expect(Scene.selector(panel)).not.toHaveAttr('popover', 'manual'),
    )
    Scene.scene<SingleModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
      {
        update: upstreamSingle.update,
        view: (current, h) =>
          forkSingle.view(
            current,
            {
              ...singleInputs(h),
              anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            },
            h,
          ),
      },
      Scene.given(openSingle()),
      anchoredSingle(),
      Scene.expect(Scene.selector(panel)).toHaveAttr('popover', 'manual'),
    )
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

describe("the fork's own parts", () => {
  // No toggle: its blur guard is a Mount this scene would have to resolve.
  const toggleless = (h: HtmlBuilder<Message>) => {
    const { buttonContent: _, ...inputs } = multiInputs(h)
    return inputs
  }
  // The bundles, as the fork hands them to `toView`; upstream's markup draws none of the parts.
  const seen = (
    initial: MultiModel,
    extra: Partial<MultiViewInputs<Fruit>>,
    ...steps: Array<MultiStep>
  ) => {
    let render: ComboboxRenderInfo | undefined
    Scene.scene<MultiModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
      {
        update: upstreamMulti.update,
        view: (current, h) =>
          forkMulti.view(
            current,
            {
              ...toggleless(h),
              ...extra,
              toView: drawn => {
                render = drawn
                return defaultToView(h)(drawn)
              },
            },
            h,
          ),
      },
      Scene.given(initial),
      ...steps,
    )
    return render!
  }

  it('draws a chip per chosen value only when asked', () => {
    expect(seen(multiModel(), {}).chips).toEqual([])
    expect(seen(multiModel(), { chips: {} }).chips.map(chip => chip.label)).toEqual(['banana'])
    expect(
      seen(multiModel(), { chips: { label: value => value.toUpperCase() } }).chips.map(
        chip => chip.label,
      ),
    ).toEqual(['BANANA'])
  })

  it.each([
    [false, 'sends Selected for its value'],
    [true, 'is disabled and sends nothing'],
  ])("with the field disabled %s, a chip's remove button %s", (isDisabled, _) => {
    Scene.scene<MultiModel, Message, UpstreamCombobox.OutMessage<Fruit>>(
      {
        update: upstreamMulti.update,
        view: (current, h) =>
          forkMulti.view(
            current,
            {
              ...toggleless(h),
              isDisabled,
              chips: {},
              toView: drawn =>
                h.div(
                  [],
                  drawn.chips.map(each => h.button(each.remove, [each.label])),
                ),
            },
            h,
          ),
      },
      Scene.given(multiModel()),
      ...(isDisabled
        ? [Scene.expect(Scene.role('button', { name: 'Remove banana' })).toHaveAttr('disabled')]
        : [
            Scene.click(Scene.role('button', { name: 'Remove banana' })),
            Scene.expectOutMessage<UpstreamCombobox.OutMessage<Fruit>>({
              _tag: 'Selected',
              value: 'banana',
            }),
          ]),
    )
  })

  it('draws the clear button only while the field has text and it is given', () => {
    const clear = { clearContent: null }
    expect(seen(multiModel(), clear).clearButton).toBeUndefined()
    expect(seen(multiModel({ inputValue: 'ch' }), {}).clearButton).toBeUndefined()
    expect(seen(multiModel({ inputValue: 'ch' }), clear).clearButton?.key).toBe('c-clear')
  })

  it('draws the empty panel only while open with no items', () => {
    const empty = { empty: null }
    expect(seen(multiModel(), { ...empty, items: [] }).empty).toBeUndefined()
    expect(seen(openMulti(), { items: [] }).empty).toBeUndefined()
    // With items, the list is drawn, and its anchor and click-away are Mounts to resolve.
    const panel = Scene.Mount.resolveAll(
      [UpstreamCombobox.AnchorCombobox, UpstreamCombobox.Message.CompletedAnchorCombobox()],
      [
        UpstreamCombobox.PortalComboboxBackdrop,
        UpstreamCombobox.Message.CompletedPortalComboboxBackdrop(),
      ],
    )
    expect(seen(openMulti(), empty, panel).empty).toBeUndefined()
    expect(seen(openMulti(), { ...empty, items: [] }).empty?.key).toBe('c-empty')
  })
})
