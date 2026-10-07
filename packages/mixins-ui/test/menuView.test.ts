// @vitest-environment jsdom
/**
 * The forked menu view draws what upstream draws. Every battery below runs
 * the identical Scene program against `@foldkit/ui/menu`'s view and the
 * fork (default `toView`), so a fork that drifts in markup, bundles, or
 * event wiring fails here. Behavior is upstream's in both scenes; only the
 * view differs. Fork-only tests at the end prove the seam: a custom `toView`
 * receives the bundles, and forked-view events drive upstream update.
 */
import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import * as Menu from '@foldkit/ui/menu'
import {
  create as createForkView,
  defaultToView,
  type MenuRenderInfo,
  type MenuViewInputs,
} from '../src/menuView.js'

const fruits = ['apple', 'banana', 'cherry'] as const
type Fruit = (typeof fruits)[number]

const upstream = Menu.create<Fruit>()
const fork = createForkView<Fruit>()
const id = 'm'
const button = `#${id}-button`
const panel = `#${id}-items`
const item = (index: number) => `#${id}-item-${index}`

const model = (overrides: Partial<Menu.Model> = {}): Menu.Model => ({
  ...Menu.init({ id }),
  ...overrides,
})

const open = (index: Option.Option<number> = Option.some(0)): Menu.Model =>
  model({ isOpen: true, maybeActiveItemIndex: index })

type Inputs = Omit<MenuViewInputs<Fruit>, 'itemToConfig' | 'buttonContent'> & {
  readonly itemToConfig: (
    item: Fruit,
    context: Readonly<{ isActive: boolean; isDisabled: boolean }>,
  ) => { readonly content: ReturnType<HtmlBuilder<Menu.Message>['span']> }
  readonly buttonContent: ReturnType<HtmlBuilder<Menu.Message>['span']>
}

const inputs = (h: HtmlBuilder<Menu.Message>, overrides: Partial<Inputs> = {}): Inputs => ({
  items: [...fruits],
  itemToConfig: item => ({ content: h.span([], [item]) }),
  buttonContent: h.span([], ['open']),
  ...overrides,
})

type Step = Parameters<typeof Scene.scene<Menu.Model, Menu.Message, Menu.OutMessage<Fruit>>>[1]

/** The same program against both views: upstream's, then the fork's. */
const runBoth = (initial: Menu.Model, overrides: Partial<Inputs>, ...steps: Array<Step>): void => {
  for (const view of [upstream.view, fork.view]) {
    Scene.scene<Menu.Model, Menu.Message, Menu.OutMessage<Fruit>>(
      {
        update: upstream.update,
        view: (current, h) => view(current, inputs(h, overrides), h),
      },
      Scene.given(initial),
      ...steps,
    )
  }
}

/** The anchor and backdrop Mounts appear with the panel; a step that opens the panel resolves them. */
const anchored = (): Step =>
  Scene.Mount.resolveAll(
    [Menu.AnchorMenu, Menu.Message.CompletedAnchorMenu()],
    [Menu.PortalMenuBackdrop, Menu.Message.CompletedPortalMenuBackdrop()],
  )
const expectExpanded = (expanded: boolean): Step =>
  Scene.expect(Scene.selector(button)).toHaveAttr('aria-expanded', String(expanded))
const expectActive = (index: number): Step =>
  Scene.expect(Scene.selector(panel)).toHaveAttr('aria-activedescendant', `${id}-item-${index}`)

describe('menu view parity (upstream view vs forked view)', () => {
  it('closed: button collapsed, no panel, no backdrop', () => {
    runBoth(
      model(),
      {},
      expectExpanded(false),
      Scene.expect(Scene.selector(button)).toHaveAttr('aria-haspopup', 'menu'),
      Scene.expect(Scene.selector(panel)).toBeAbsent(),
      Scene.expect(Scene.selector('.backdrop')).toBeAbsent(),
    )
  })

  it('open: expanded button, menu panel, three items, first active', () => {
    runBoth(
      open(),
      { backdropClassName: 'backdrop' },
      anchored(),
      expectExpanded(true),
      Scene.expect(Scene.selector(panel)).toHaveAttr('role', 'menu'),
      expectActive(0),
      Scene.expect(Scene.selector(item(0))).toHaveAttr('role', 'menuitem'),
      Scene.expect(Scene.selector(item(2))).toHaveAttr('role', 'menuitem'),
      Scene.expect(Scene.selector('.backdrop')).toExist(),
    )
  })

  it('disabled items are marked and carry no active state', () => {
    const disabled = (initial: Menu.Model): void => {
      for (const view of [upstream.view, fork.view]) {
        Scene.scene<Menu.Model, Menu.Message, Menu.OutMessage<Fruit>>(
          {
            update: upstream.update,
            view: (current, h) =>
              view(current, inputs(h, { isItemDisabled: item => item === 'banana' }), h),
          },
          Scene.given(initial),
          anchored(),
          Scene.expect(Scene.selector(item(1))).toHaveAttr('aria-disabled', 'true'),
          Scene.expect(Scene.selector(item(0))).toHaveAttr('data-active', ''),
        )
      }
    }
    disabled(open())
  })

  it('grouped: group roles, headings, and separators', () => {
    const grouped = (initial: Menu.Model): void => {
      for (const view of [upstream.view, fork.view]) {
        Scene.scene<Menu.Model, Menu.Message, Menu.OutMessage<Fruit>>(
          {
            update: upstream.update,
            view: (current, h) =>
              view(
                current,
                inputs(h, {
                  itemGroupKey: item => (item === 'banana' ? 'b' : 'a'),
                  groupToHeading: key => ({
                    content: h.span([], [`group-${key}`]),
                  }),
                  separatorClassName: 'sep',
                }),
                h,
              ),
          },
          Scene.given(initial),
          anchored(),
          Scene.expect(Scene.selector('[role="group"]')).toHaveAttr(
            'aria-labelledby',
            `${id}-heading-a`,
          ),
          Scene.expect(Scene.selector(`#${id}-heading-b`)).toHaveAttr('role', 'presentation'),
          Scene.expect(Scene.selector('[role="separator"]')).toHaveAttr('class', 'sep'),
        )
      }
    }
    grouped(open())
  })

  it('scroll wrapper appears only when scroll styling is given', () => {
    const scrolled = (initial: Menu.Model): void => {
      for (const view of [upstream.view, fork.view]) {
        Scene.scene<Menu.Model, Menu.Message, Menu.OutMessage<Fruit>>(
          {
            update: upstream.update,
            view: (current, h) => view(current, inputs(h, { itemsScrollClassName: 'scroll' }), h),
          },
          Scene.given(initial),
          anchored(),
          Scene.expect(Scene.selector(`${panel} .scroll`)).toHaveAttr('class', 'scroll'),
        )
      }
    }
    scrolled(open())
  })
})

describe('forked view seam', () => {
  it('a custom toView receives the computed bundles', () => {
    let seen: MenuRenderInfo | undefined
    Scene.scene<Menu.Model, Menu.Message, Menu.OutMessage<Fruit>>(
      {
        update: upstream.update,
        view: (current, h) =>
          fork.view(
            current,
            {
              ...inputs(h),
              toView: render => {
                seen = render
                return defaultToView(h)(render)
              },
            },
            h,
          ),
      },
      Scene.given(open()),
      anchored(),
    )
    const render = seen!
    expect(render.isVisible).toBe(true)
    expect(render.backdrop).toBeDefined()
    expect(render.items).toBeDefined()
    expect(render.groups).toHaveLength(1)
    expect(render.groups[0]!.items).toHaveLength(3)
    expect(render.groups[0]!.group).toBeUndefined()
  })

  it('a closed custom toView carries button and wrapper alone', () => {
    let seen: MenuRenderInfo | undefined
    Scene.scene<Menu.Model, Menu.Message, Menu.OutMessage<Fruit>>(
      {
        update: upstream.update,
        view: (current, h) =>
          fork.view(
            current,
            {
              ...inputs(h),
              toView: render => {
                seen = render
                return defaultToView(h)(render)
              },
            },
            h,
          ),
      },
      Scene.given(model()),
    )
    const render = seen!
    expect(render.isVisible).toBe(false)
    expect(render.backdrop).toBeUndefined()
    expect(render.items).toBeUndefined()
    expect(render.groups).toEqual([])
  })

  it('pointer opens through the forked view and clicking selects', () => {
    Scene.scene<Menu.Model, Menu.Message, Menu.OutMessage<Fruit>>(
      {
        update: upstream.update,
        view: (current, h) => fork.view(current, inputs(h), h),
      },
      Scene.given(model()),
      // A mouse open records the pointer origin, so the later blur is ignored.
      Scene.pointerDown(button),
      Scene.expectHandled(),
      Scene.Command.resolve(Menu.FocusItems, Menu.Message.CompletedFocusItems()),
      anchored(),
      expectExpanded(true),
      Scene.click(item(1)),
      Scene.expectOutMessage<Menu.OutMessage<Fruit>>({
        _tag: 'Selected',
        value: 'banana',
        index: 1,
      }),
      Scene.Command.resolve(Menu.FocusButton, Menu.Message.CompletedFocusButton()),
      Scene.Mount.expectEnded(Menu.AnchorMenu, Menu.PortalMenuBackdrop),
      expectExpanded(false),
    )
  })
})
