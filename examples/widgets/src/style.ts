/**
 * The showcase's look, one `Style.forSlots` per widget plus the page sheet.
 * Layout and control chrome are static pieces; state visuals read the ARIA
 * the behaviors already write (`Style.states(..., 'aria-pressed')`), so no
 * view changes and no `whenInput` — the DOM carries the state. `stylesheet`
 * is what `entry.ts` installs; tests read it through `Inert.css`.
 */
import { Style } from 'foldkit-mixins'
import type { AccordionSlots } from './accordion/view.js'
import type { AlertDialogSlots } from './alert-dialog/view.js'
import type { AutocompleteSlots } from './autocomplete/view.js'
import type { CheckboxGroupSlots } from './checkbox-group/view.js'
import type { CommandSlots } from './command/view.js'
import type { MeterSlots } from './meter/view.js'
import type { HoverCardSlots } from './hover-card/view.js'
import type { MenubarSlots } from './menubar/view.js'
import type { ContextMenuSlots } from './context-menu/view.js'
import type { NumberFieldSlots } from './number-field/view.js'
import type { OtpFieldSlots } from './otp-field/view.js'
import type { ToggleSlots } from './toggle/view.js'
import type { ToggleGroupSlots } from './toggle-group/view.js'
import type { ToolbarSlots } from './toolbar/view.js'

const ink = '#18181b'
const muted = '#52525b'
const line = '#d4d4d8'
const wash = '#f4f4f5'
const accent = '#4f46e5'
const onAccent = '#ffffff'

const focus = Style.pseudo(':focus-visible', {
  outline: `2px solid ${accent}`,
  outlineOffset: '2px',
})

const control = Style.self({
  font: 'inherit',
  color: ink,
  background: onAccent,
  border: `1px solid ${line}`,
  borderRadius: '8px',
  paddingBlock: '0.375rem',
  paddingInline: '0.75rem',
  cursor: 'pointer',
})

const pressed = Style.states(
  {
    true: {
      background: ink,
      borderColor: ink,
      color: onAccent,
    },
  },
  'aria-pressed',
)

const selected = Style.states(
  {
    true: {
      background: wash,
    },
  },
  'aria-selected',
)

export const toolbarStyle = (slots: typeof ToolbarSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'flex', gap: '0.5rem' }),
      tool: Style.compose(control, focus, pressed),
    },
    { name: 'ShowcaseToolbar' },
  )

export const toggleStyle = (slots: typeof ToggleSlots) =>
  Style.forSlots(slots)(
    { control: Style.compose(control, focus, pressed) },
    { name: 'ShowcaseToggle' },
  )

export const toggleGroupStyle = (slots: typeof ToggleGroupSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'inline-flex', gap: '0.5rem' }),
      option: Style.compose(control, focus, pressed),
    },
    { name: 'ShowcaseToggleGroup' },
  )

export const accordionStyle = (slots: typeof AccordionSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: '0.5rem', maxWidth: '28rem' }),
      trigger: Style.compose(
        Style.self({ display: 'block', width: '100%', textAlign: 'start' }),
        control,
        focus,
        Style.states({ true: { borderColor: ink } }, 'aria-expanded'),
      ),
      content: Style.self({ margin: '0', paddingInline: '0.75rem', color: muted }),
    },
    { name: 'ShowcaseAccordion' },
  )

export const numberFieldStyle = (slots: typeof NumberFieldSlots) =>
  Style.forSlots(slots)(
    {
      control: Style.compose(
        Style.self({
          display: 'inline-block',
          minWidth: '3rem',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }),
        control,
        focus,
      ),
      label: Style.self({ display: 'block', fontWeight: '600', marginBlockEnd: '0.25rem' }),
      description: Style.self({ color: muted, fontSize: '0.8125rem', marginBlock: '0.25rem' }),
      increment: Style.compose(control, focus),
      decrement: Style.compose(control, focus),
    },
    { name: 'ShowcaseNumberField' },
  )

export const checkboxGroupStyle = (slots: typeof CheckboxGroupSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: '0.375rem', border: 'none', padding: '0' }),
      option: Style.compose(
        Style.self({ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }),
        focus,
      ),
    },
    { name: 'ShowcaseCheckboxGroup' },
  )

export const meterStyle = (slots: typeof MeterSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: '0.5rem', maxWidth: '24rem' }),
      bar: Style.self({ width: '100%', height: '1.25rem' }),
      less: Style.compose(control, focus),
      more: Style.compose(control, focus),
    },
    { name: 'ShowcaseMeter' },
  )

export const alertDialogStyle = (slots: typeof AlertDialogSlots) =>
  Style.forSlots(slots)(
    {
      trigger: Style.compose(control, focus),
      panel: Style.compose(
        Style.self({
          display: 'grid',
          gap: '0.75rem',
          maxWidth: '24rem',
          padding: '1.25rem',
          background: onAccent,
          border: `1px solid ${line}`,
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgb(0 0 0 / 0.18)',
        }),
        focus,
      ),
      cancel: Style.compose(control, focus),
      confirm: Style.compose(
        Style.self({ background: '#dc2626', borderColor: '#dc2626', color: onAccent }),
        focus,
      ),
    },
    { name: 'ShowcaseAlertDialog' },
  )

export const autocompleteStyle = (slots: typeof AutocompleteSlots) =>
  Style.forSlots(slots)(
    {
      label: Style.self({ display: 'block', fontWeight: '600', marginBlockEnd: '0.25rem' }),
      input: Style.compose(
        Style.self({ width: '100%', boxSizing: 'border-box', cursor: 'text' }),
        control,
        focus,
      ),
      list: Style.self({
        display: 'grid',
        border: `1px solid ${line}`,
        borderRadius: '8px',
        overflow: 'hidden',
        marginBlockStart: '0.25rem',
      }),
      item: Style.compose(
        Style.self({
          textAlign: 'start',
          background: onAccent,
          border: 'none',
          borderRadius: '0',
          paddingBlock: '0.375rem',
          paddingInline: '0.75rem',
          cursor: 'pointer',
        }),
        focus,
        selected,
      ),
    },
    { name: 'ShowcaseAutocomplete' },
  )

export const otpFieldStyle = (slots: typeof OtpFieldSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'flex', gap: '0.5rem', alignItems: 'center' }),
      cell: Style.compose(
        Style.self({
          width: '2.75rem',
          textAlign: 'center',
          fontSize: '1.25rem',
          fontVariantNumeric: 'tabular-nums',
        }),
        control,
        focus,
      ),
    },
    { name: 'ShowcaseOtpField' },
  )

export const commandStyle = (slots: typeof CommandSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: '0.5rem', maxWidth: '28rem' }),
      input: Style.compose(
        Style.self({ width: '100%', boxSizing: 'border-box' }),
        control,
        Style.self({ cursor: 'text' }),
        focus,
      ),
      list: Style.self({
        display: 'grid',
        border: `1px solid ${line}`,
        borderRadius: '8px',
        overflow: 'hidden',
      }),
      item: Style.compose(
        Style.self({ paddingBlock: '0.375rem', paddingInline: '0.75rem', cursor: 'pointer' }),
        focus,
        selected,
      ),
    },
    { name: 'ShowcaseCommand' },
  )

export const hoverCardStyle = (slots: typeof HoverCardSlots) =>
  Style.forSlots(slots)(
    {
      trigger: Style.compose(
        Style.self({
          font: 'inherit',
          color: accent,
          background: 'transparent',
          border: 'none',
          padding: '0',
          cursor: 'pointer',
          textDecoration: 'underline',
        }),
        focus,
      ),
      card: Style.compose(
        Style.self({
          maxWidth: '20rem',
          marginBlockStart: '0.25rem',
          padding: '0.75rem',
          background: onAccent,
          border: `1px solid ${line}`,
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
          color: muted,
          fontSize: '0.875rem',
        }),
        focus,
      ),
    },
    { name: 'ShowcaseHoverCard' },
  )

export const contextMenuStyle = (slots: typeof ContextMenuSlots) =>
  Style.forSlots(slots)(
    {
      files: Style.self({ display: 'grid', gap: '0.25rem', maxWidth: '24rem' }),
      row: Style.compose(
        Style.self({ paddingBlock: '0.375rem', paddingInline: '0.75rem', cursor: 'context-menu' }),
        focus,
      ),
      popup: Style.compose(
        Style.self({
          display: 'grid',
          minWidth: '10rem',
          background: onAccent,
          border: `1px solid ${line}`,
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
          padding: '0.25rem',
        }),
        focus,
      ),
      item: Style.compose(
        Style.self({
          textAlign: 'start',
          background: 'transparent',
          border: 'none',
          borderRadius: '6px',
          paddingBlock: '0.375rem',
          paddingInline: '0.75rem',
          cursor: 'pointer',
        }),
        focus,
        selected,
      ),
    },
    { name: 'ShowcaseContextMenu' },
  )

export const menubarStyle = (slots: typeof MenubarSlots) =>
  Style.forSlots(slots)(
    {
      bar: Style.self({
        display: 'flex',
        gap: '0.25rem',
        maxWidth: '28rem',
        padding: '0.25rem',
        background: wash,
        border: `1px solid ${line}`,
        borderRadius: '10px',
      }),
      trigger: Style.compose(control, focus),
      popup: Style.compose(
        Style.self({
          display: 'grid',
          minWidth: '12rem',
          marginBlockStart: '0.25rem',
          background: onAccent,
          border: `1px solid ${line}`,
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
          padding: '0.25rem',
        }),
        focus,
      ),
      item: Style.compose(
        Style.self({
          textAlign: 'start',
          background: 'transparent',
          border: 'none',
          borderRadius: '6px',
          paddingBlock: '0.375rem',
          paddingInline: '0.75rem',
          cursor: 'pointer',
        }),
        focus,
        selected,
      ),
    },
    { name: 'ShowcaseMenubar' },
  )
