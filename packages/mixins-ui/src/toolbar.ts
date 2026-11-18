import { Option } from 'effect'
import {
  A11y,
  Attr,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type Diagnostic,
  type NamedStyle,
} from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'

/**
 * A toolbar publishes its `root`, the `group`s that gather related controls
 * under a name, and the `separator` between sets. The controls are the
 * caller's own elements (a `Button`, a toggle, a menu's trigger), which the
 * toolbar hands the attributes of its one tab stop; it adds no markup around
 * them, so a control keeps the class of its own recipe.
 */
export const ToolbarSlots = Slots.define({
  root: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaDisabled],
  }),
  group: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  separator: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

/**
 * The toolbar's own contract: a named, keyboard-navigable root. Its controls
 * are the caller's, so their roles and activation are theirs; the group and
 * separator carry only a role.
 */
export const ToolbarPattern = A11y.pattern({
  root: {
    capability: Capability.Container,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
    obligations: [A11y.Navigation, A11y.FocusStrategy, A11y.Name],
  },
  group: {
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
    optional: true,
  },
  separator: { capability: Capability.Container, attributes: [Attr.Role], optional: true },
})

/** What a control's `draw` receives to put on its one focusable element. */
export interface ToolbarStop<Message> {
  /**
   * The element's id, its `tabindex` (0 on the tab stop, -1 elsewhere) and
   * the `focus` report that keeps the stop where focus last was. Spread them
   * on the focusable element (`Button.view`'s `attributes.button`).
   */
  readonly attributes: ReadonlyArray<Attribute<Message>>
  /**
   * Whether the control is off, by itself, its group or the toolbar. Draw the
   * element disabled: the toolbar skips it, so it takes no focus.
   */
  readonly disabled: boolean
}

/** One focusable element, drawn by the application. */
export interface ToolbarControl<Message> {
  /** Unique in the toolbar; what `onFocus` reports and `roving.current` holds. */
  readonly id: string
  readonly disabled?: boolean | undefined
  readonly draw: (stop: ToolbarStop<Message>) => Html
}

/** Controls under a name, as `role="group"`. */
export interface ToolbarGroup<Message> {
  /** The group's accessible name. */
  readonly label: string
  readonly controls: ReadonlyArray<ToolbarControl<Message>>
  /** Turns every control of the group off. */
  readonly disabled?: boolean | undefined
}

/** What a toolbar holds, in order: a control, a named group of controls, or `'separator'`, a rule between sets. */
export type ToolbarItem<Message> = ToolbarControl<Message> | ToolbarGroup<Message> | 'separator'

export interface ToolbarView<Message> {
  /** Prefixes the ids the controls draw, which the arrows move focus by; unique on the page. */
  readonly id: string
  /** What the toolbar is for, read as its accessible name. */
  readonly label: string
  readonly items: ReadonlyArray<ToolbarItem<Message>>
  /**
   * Where the one tab stop is: the placed `RovingTabindex` slice, as the
   * application keeps it. Tab enters at the control it names, the one focused
   * last, or the first enabled control while it names none that can be.
   */
  readonly roving: RovingTabindex.Model
  /** Sent with a control's id when it takes focus, by a key or a press; answer it with `RovingTabindex`'s `Focused`. */
  readonly onFocus: (id: string) => NoInfer<Message>
  /** Default `'horizontal'`: Left and Right move, Up and Down are left to the page. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /** Default `ltr`; `rtl` swaps ArrowLeft and ArrowRight in a horizontal toolbar. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** Default `true`: the arrows wrap from the last control to the first. */
  readonly loop?: boolean | undefined
  /** Every control is off and the toolbar says so (`aria-disabled`); it has no tab stop and takes no key. */
  readonly disabled?: boolean | undefined
  /**
   * Keys the application answers beside the arrows, Home and End. They share
   * one keydown owner: a route on the same gesture as another is a diagnostic
   * naming both.
   */
  readonly routes?: ReadonlyArray<Behaviors.Keys.Route<undefined, NoInfer<Message>>> | undefined
  /** A style of `ToolbarSlots`, for the toolbar's look. */
  readonly style?: NamedStyle<typeof ToolbarSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * `onFocus` for a toolbar whose tab stop is `Bundles.Toolbar`: the `Focused`
 * Message of the stop, wrapped as the application wraps that child's Messages.
 */
export const focused =
  <Message>(wrap: (message: RovingTabindex.Message) => Message) =>
  (id: string): Message =>
    wrap(RovingTabindex.Message.Focused({ id }))

/** What a Toolbar is given once: its look and each option that holds no Message, state or drawing. */
export type ToolbarPreset = Pick<
  ToolbarView<never>,
  'orientation' | 'direction' | 'loop' | 'style'
> & { readonly mixins?: MixinList<never> }

/**
 * The application's own Toolbar: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order; a style given at the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ToolbarPreset, Names>,
): {
  readonly view: <Outer>(
    options: ToolbarView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})

/** The id the control `id` of the toolbar `toolbarId` draws, for a Command that focuses it. */
export const controlId = (toolbarId: string, id: string): string => `${toolbarId}-${id}`

/**
 * Whether a focused control uses `key` itself: a text field its caret keys
 * (Home and End always, Left and Right until the caret is at the edge the key
 * points to, Up and Down in a textarea), a select and a range their value's.
 * A button or a checkbox uses none, so the toolbar moves.
 */
const usedBy = (element: Element, key: string, direction: 'ltr' | 'rtl'): boolean => {
  const arrow = key.startsWith('Arrow')
  if (!arrow && key !== 'Home' && key !== 'End') return false
  if (element instanceof HTMLSelectElement) return true
  if (element instanceof HTMLElement && element.isContentEditable) return true
  if (element instanceof HTMLInputElement && element.type === 'range') return true
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return false
  }
  if (key === 'Home' || key === 'End') {
    return !(element instanceof HTMLInputElement && element.selectionStart === null)
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    return element instanceof HTMLTextAreaElement || element.type === 'number'
  }
  const { selectionStart: start, selectionEnd: end, value } = element
  // A number field has no caret to read, and a checkbox no text.
  if (start === null || end === null) return false
  if (start !== end) return true
  const backward = key === (direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft')
  return backward ? start > 0 : end < value.length
}

/** The toolbar's own keys: the arrows along the orientation, Home and End. */
const ownRoutes = <Message>(
  orientation: 'horizontal' | 'vertical',
  answer: (
    press: Behaviors.Keys.Press<undefined>,
  ) => Option.Option<Message | Behaviors.Keys.Focus<Message>>,
): ReadonlyArray<Behaviors.Keys.Route<undefined, Message>> => [
  Behaviors.Keys.route<undefined, Message>('Toolbar', {
    on: [
      ...Behaviors.Keys.withShift('Home'),
      ...Behaviors.Keys.withShift('End'),
      ...RovingTabindex.arrowChords(orientation),
    ],
    handle: answer,
  }),
]

/**
 * The `mixins:key-conflict` that drawing the toolbar with `routes` would
 * throw, or none: the application's routes against the arrows along the
 * orientation (default `'horizontal'`), Home and End, and against each other.
 * A disabled toolbar still builds its routes, so it throws as well.
 */
export const conflict = <Message>(
  routes: ReadonlyArray<Behaviors.Keys.Route<undefined, Message>>,
  input: Pick<ToolbarView<Message>, 'orientation'> = {},
): Option.Option<Diagnostic> =>
  Behaviors.Keys.conflict(
    [...ownRoutes<Message>(input.orientation ?? 'horizontal', () => Option.none()), ...routes],
    Option.some('root'),
  )

/**
 * A toolbar in one call, the APG's: `role="toolbar"` named by `label`, one tab
 * stop over its controls, and the arrows along the orientation, Home and End
 * moving focus between them. The view holds no state; the application keeps
 * the tab stop (`roving`, a placed `RovingTabindex`) so that leaving and
 * coming back with Tab lands on the control focused last.
 *
 * A disabled control is skipped by the arrows and takes no focus, as in
 * `Segmented`: the APG leaves the choice open, and a focusable disabled
 * control would stop a keyboard user on something that does nothing. A text
 * field, a select or a range keeps the keys it uses itself (see `usedBy`), so
 * the arrows leave a text field only from the edge they point at, and Home and
 * End never leave it: place a field last, as the APG advises, or leave it with
 * Tab. A press that starts in something the toolbar did not draw (a menu's
 * items) is left to it.
 */
export const view = <Message>(options: ToolbarView<Message>, h: HtmlBuilder<Message>): Html => {
  const off = options.disabled === true
  const orientation = options.orientation ?? 'horizontal'
  const direction = options.direction ?? 'ltr'
  const controls = options.items.flatMap(item => {
    if (item === 'separator') return []
    if ('controls' in item) {
      return item.controls.map(control => ({
        control,
        disabled: off || item.disabled === true || control.disabled === true,
      }))
    }
    return [{ control: item, disabled: off || item.disabled === true }]
  })
  const items = Behaviors.Collection.of(controls, {
    id: each => each.control.id,
    disabled: each => each.disabled,
  })
  const stop = RovingTabindex.tabStop(items, options.roving.current)
  const keys = Behaviors.Keys.behavior(ToolbarSlots)<undefined, Message>({
    slot: 'root',
    name: 'ToolbarKeys',
    routes: [
      ...ownRoutes<Message>(orientation, ({ key, modifiers }) => {
        // Read at the press: a render may lag a held key, and only the DOM knows
        // whether the press came from a control of this toolbar.
        const active = document.activeElement
        const focused = items.ids.findIndex(id => controlId(options.id, id) === active?.id)
        if (active !== null && active !== document.body && focused === -1) return Option.none()
        if (focused !== -1 && active !== null && usedBy(active, key, direction)) {
          return Option.none()
        }
        const current = focused === -1 ? items.indexOf(options.roving.current ?? '') : focused
        const next = RovingTabindex.move(items.enabled, current, key, modifiers, {
          orientation,
          loop: options.loop ?? true,
          direction,
        })
        const id = next === undefined ? undefined : items.ids[next]
        return id === undefined
          ? Option.none()
          : Option.some(Behaviors.Keys.focus(controlId(options.id, id), options.onFocus(id)))
      }),
      ...(options.routes ?? []),
    ],
  })
  const builders = SlotView.buildersFor(
    ToolbarSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      ...(off ? [] : [keys.mixin]),
      ...(options.mixins ?? []),
    ],
    { input: undefined, h },
  )
  const drawControl = (control: ToolbarControl<Message>): Html => {
    const at = items.indexOf(control.id)
    return control.draw({
      attributes: [
        h.Id(controlId(options.id, control.id)),
        h.Tabindex(at === stop ? 0 : -1),
        h.OnFocus(options.onFocus(control.id)),
      ],
      disabled: items.isDisabled(at),
    })
  }
  const across = orientation === 'horizontal' ? 'vertical' : 'horizontal'
  return h.div(
    builders.root.attrs([
      h.Role('toolbar'),
      h.AriaLabel(options.label),
      h.AriaOrientation(orientation),
      h.DataAttribute('orientation', orientation),
      ...(off ? [h.AriaDisabled(true)] : []),
    ]),
    options.items.map((item, index) => {
      if (item === 'separator') {
        return h.div(
          builders.separator.attrs([
            h.Key(`separator-${index}`),
            h.Role('separator'),
            h.AriaOrientation(across),
            h.DataAttribute('orientation', across),
          ]),
          [],
        )
      }
      if ('controls' in item) {
        return h.div(
          builders.group.attrs([
            h.Key(`group-${index}`),
            h.Role('group'),
            h.AriaLabel(item.label),
            h.DataAttribute('orientation', orientation),
          ]),
          item.controls.map(drawControl),
        )
      }
      return drawControl(item)
    }),
  )
}
