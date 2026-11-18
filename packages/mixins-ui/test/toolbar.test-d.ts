/**
 * Compile-time: a mixin cannot name a slot the toolbar lacks, an orientation
 * outside the two is refused, and neither a key route, `onFocus` nor a
 * control's drawing may speak a Message the toolbar does not send. Type-checked,
 * not executed.
 */
import { Option } from 'effect'
import { Behavior, Behaviors } from 'foldkit-mixins'
import { defineMessageUnion } from 'foldkit/message'
import { Toolbar, ToolbarSlots } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

const Foreign = defineMessageUnion({ SentElsewhere: {} })

Behavior.forSlots(ToolbarSlots)<unknown, never>({
  // @ts-expect-error the toolbar publishes no item slot
  item: Behavior.slot({}),
})

const control: Toolbar.ToolbarControl<TestMessage> = {
  id: 'bold',
  draw: ({ attributes }) => h.button(attributes, ['Bold']),
}

const bar = {
  id: 'bar',
  label: 'Formatting',
  items: [control, 'separator'],
  roving: { current: null },
  onFocus: () => message('Clicked'),
} as const

export const plain = Toolbar.view(bar, h)

export const routed = Toolbar.view(
  {
    ...bar,
    routes: [
      Behaviors.Keys.route('Open', {
        on: [Behaviors.Keys.chord('F10')],
        handle: () => Option.some(message('Clicked')),
      }),
    ],
  },
  h,
)

export const foreignRoute = Toolbar.view(
  {
    ...bar,
    routes: [
      // @ts-expect-error a route cannot send a Message the view does not
      Behaviors.Keys.route('Open', {
        on: [Behaviors.Keys.chord('F10')],
        handle: () => Option.some(Foreign.SentElsewhere()),
      }),
    ],
  },
  h,
)

export const foreignFocus = Toolbar.view(
  {
    ...bar,
    // @ts-expect-error onFocus cannot answer with a Message the view does not send
    onFocus: () => Foreign.SentElsewhere(),
  },
  h,
)

export const badOrientation = Toolbar.view(
  {
    ...bar,
    // @ts-expect-error a toolbar runs along one axis
    orientation: 'both',
  },
  h,
)

export const noStop = Toolbar.view(
  // @ts-expect-error the tab stop is the application's, so `roving` is required
  { id: 'bar', label: 'Formatting', items: [control], onFocus: () => message('Clicked') },
  h,
)

export const noDrawing = Toolbar.view(
  {
    ...bar,
    items: [
      // @ts-expect-error a control is drawn by the application: `draw` is required
      { id: 'bold' },
    ],
  },
  h,
)

export const nameless = Toolbar.view(
  {
    ...bar,
    items: [
      // @ts-expect-error a group is named
      { controls: [control] },
    ],
  },
  h,
)

export const unknownItem = Toolbar.view(
  {
    ...bar,
    // @ts-expect-error the only word an item can be is 'separator'
    items: [control, 'divider'],
  },
  h,
)

export const separatorInGroup = Toolbar.view(
  {
    ...bar,
    items: [
      {
        label: 'Align',
        // @ts-expect-error a group holds controls, which a rule is not
        controls: ['separator'],
      },
    ],
  },
  h,
)

// Inference reaches the controls from `h`, with no annotation on them.
export const inferred = Toolbar.view(
  {
    id: 'bar',
    label: 'Formatting',
    items: [
      { id: 'bold', draw: ({ attributes }) => h.button(attributes, ['Bold']) },
      'separator',
      {
        label: 'Align',
        controls: [{ id: 'left', draw: ({ attributes }) => h.button(attributes, ['Left']) }],
      },
    ],
    roving: { current: null },
    onFocus: () => message('Clicked'),
  },
  h,
)

const Configured = Toolbar.configure({
  base: { loop: false },
  presets: { stacked: { orientation: 'vertical' } },
})
export const stacked = Configured.view({ ...bar, preset: 'stacked' }, h)

// @ts-expect-error `stakced` is no preset.
export const misspelt = Configured.view({ ...bar, preset: 'stakced' }, h)

// @ts-expect-error the stop is the call's: a preset holds no Model.
Toolbar.configure({ base: { roving: { current: null } } })

// @ts-expect-error the controls are the call's: a preset holds no drawing.
Toolbar.configure({ base: { items: [] } })

// @ts-expect-error a preset's orientation is one of the two.
Toolbar.configure({ base: { orientation: 'diagonal' } })

// @ts-expect-error the Message of another application's cannot answer a focus.
export const foreign = Toolbar.view({ ...bar, onFocus: Toolbar.focused(() => 'nope') }, h)
