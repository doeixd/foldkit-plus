/**
 * The showcase's look, one `Style.forSlots` per widget plus the page sheet.
 * Layout and control chrome are static pieces; state visuals read the ARIA
 * the behaviors already write (`Style.states(..., 'aria-pressed')`), so no
 * view changes and no `whenInput` — the DOM carries the state. `stylesheet`
 * is what `entry.ts` installs; tests read it through `Inert.css`.
 */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { Placing } from 'foldkit-primitives/interaction'
import type { AccordionSlots } from './accordion/view.js'
import type { AlertDialogSlots } from './alert-dialog/view.js'
import type { AutocompleteSlots } from './autocomplete/view.js'
import type { CheckboxGroupSlots } from './checkbox-group/view.js'
import type { CommandSlots } from './command/view.js'
import type { MeterSlots } from './meter/view.js'
import type { HoverCardSlots } from './hover-card/view.js'
import type { MenubarSlots } from './menubar/view.js'
import type { NavigationMenuSlots } from './navigation-menu/view.js'
import type { ContextMenuSlots } from './context-menu/view.js'
import type { NativeSelectSlots } from './native-select/view.js'
import type { ResizableSlots } from './resizable/view.js'
import type { SidebarSlots } from './sidebar/view.js'
import type { NumberFieldSlots } from './number-field/view.js'
import type { OtpFieldSlots } from './otp-field/view.js'
import type { PaletteSlots } from './palette/view.js'
import type { ProgressSlots } from './progress/view.js'
import type { ToggleSlots } from './toggle/view.js'
import type { ToggleGroupSlots } from './toggle-group/view.js'
import type { ToolbarSlots } from './toolbar/view.js'

/** Fallback until `PlaceAt` writes the offset under the open trigger. */
const underTrigger = `var(${Placing.placedTop}, calc(100% + 4px))`

/**
 * The same palette the design-system demo ships, so a token change shows up
 * here too. Island slots are each widget's own anatomy, so a Button recipe
 * does not fit them; the chrome below reads these tokens instead.
 */
const palette = Theme.compose(
  Theme.oklch({
    accent: { h: 222, c: 0.09, l: '52%', dark: { l: '70%', c: 0.1 } },
    surfaceSaturation: 0.003,
    surfaceContrast: '60%',
  }),
  Theme.define({ knob: { 'radius-factor': '1.4' } }),
)

const app = AppStyle.make({ palette })

/** Reset, token layer, palette, and body defaults. `entry.ts` installs it. */
export const pageStylesheet = app.stylesheet

const t = app.t
const ink = t.text.overt
const muted = t.text.muted
const line = t.outline.default
const wash = t.surface.muted
const accent = t.accent.default
const onAccent = t.surface.base

const focus = Style.pseudo(':focus-visible', {
  outline: `${t.border.thick} solid ${t.outline.focus}`,
  outlineOffset: '2px',
})

const control = Style.self({
  font: 'inherit',
  color: ink,
  background: onAccent,
  border: `${t.border.thin} solid ${line}`,
  borderRadius: t.radius.lg,
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

/** One dimmer behind every modal island. */
const modalBackdrop = Style.self({
  position: 'fixed',
  inset: '0',
  zIndex: '10',
  background: `color-mix(in oklch, ${t.surface.bedrock} 40%, transparent)`,
})

/**
 * One floating panel for modal islands; each island rides its placement
 * (where it sits, how wide) beside this. Kept in one place so the islands
 * agree on chrome without copying it.
 */
const modalPanel = (width: string): ReturnType<typeof Style.self> =>
  Style.self({
    position: 'fixed',
    left: '50%',
    zIndex: '20',
    display: 'grid',
    width: `min(${width}, calc(100vw - 2rem))`,
    background: onAccent,
    border: `${t.border.thin} solid ${line}`,
    borderRadius: t.radius.xl,
    boxShadow: t.shadow['2xl'],
  })

export const toolbarStyle = (slots: typeof ToolbarSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'flex', gap: '0.5rem' }),
      tool: Style.compose(
        control,
        focus,
        pressed,
        Style.states({ true: { opacity: '0.45', cursor: 'not-allowed' } }, 'aria-disabled'),
      ),
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
      section: Style.self({ display: 'grid' }),
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
          paddingBlock: '0.375rem',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          border: `1px solid ${line}`,
          background: onAccent,
        }),
        focus,
      ),
      label: Style.self({ display: 'block', fontWeight: '600', marginBlockEnd: '0.25rem' }),
      description: Style.self({ color: muted, fontSize: '0.8125rem', marginBlock: '0.25rem' }),
      stepper: Style.self({ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }),
      increment: Style.compose(
        Style.self({ minWidth: '2.75rem', fontSize: '1.125rem' }),
        control,
        focus,
        Style.states({ true: { opacity: '0.4', cursor: 'not-allowed' } }, 'aria-disabled'),
      ),
      decrement: Style.compose(
        Style.self({ minWidth: '2.75rem', fontSize: '1.125rem' }),
        control,
        focus,
        Style.states({ true: { opacity: '0.4', cursor: 'not-allowed' } }, 'aria-disabled'),
      ),
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

export const nativeSelectStyle = (slots: typeof NativeSelectSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: '0.5rem', maxWidth: '24rem' }),
      field: Style.compose(control, focus),
    },
    { name: 'ShowcaseNativeSelect' },
  )

export const progressStyle = (slots: typeof ProgressSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: '0.5rem', maxWidth: '24rem' }),
      bar: Style.self({ width: '100%', height: '1.25rem' }),
      less: Style.compose(control, focus),
      more: Style.compose(control, focus),
      unknown: Style.compose(control, focus),
    },
    { name: 'ShowcaseProgress' },
  )

export const alertDialogStyle = (slots: typeof AlertDialogSlots) =>
  Style.forSlots(slots)(
    {
      trigger: Style.compose(control, focus),
      backdrop: modalBackdrop,
      panel: Style.compose(
        modalPanel('24rem'),
        Style.self({
          top: '50%',
          translate: '-50% -50%',
          gap: '0.75rem',
          maxHeight: 'calc(100vh - 2rem)',
          overflow: 'auto',
          padding: '1.25rem',
        }),
        focus,
      ),
      cancel: Style.compose(control, focus),
      confirm: Style.compose(
        Style.self({
          background: t.error.default,
          borderColor: t.error.default,
          color: t.error['on-fill'],
        }),
        focus,
      ),
    },
    { name: 'ShowcaseAlertDialog' },
  )

export const autocompleteStyle = (slots: typeof AutocompleteSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ position: 'relative', display: 'grid', gap: '0.25rem' }),
      label: Style.self({ display: 'block', fontWeight: '600', marginBlockEnd: '0.25rem' }),
      input: Style.compose(
        Style.self({ width: '100%', boxSizing: 'border-box', cursor: 'text' }),
        control,
        focus,
      ),
      list: Style.self({
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: '0',
        right: '0',
        zIndex: '10',
        display: 'grid',
        border: `1px solid ${line}`,
        borderRadius: '8px',
        overflow: 'hidden',
        background: onAccent,
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
      root: Style.self({
        position: 'relative',
        display: 'grid',
        gap: '0.5rem',
        maxWidth: '28rem',
      }),
      input: Style.compose(
        Style.self({ width: '100%', boxSizing: 'border-box' }),
        control,
        Style.self({ cursor: 'text' }),
        focus,
      ),
      list: Style.self({
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: '0',
        right: '0',
        zIndex: '10',
        display: 'grid',
        border: `1px solid ${line}`,
        borderRadius: '8px',
        overflow: 'hidden',
        background: onAccent,
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
      wrap: Style.self({ position: 'relative', display: 'inline-block' }),
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
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: '0',
          zIndex: '10',
          width: 'max-content',
          maxWidth: 'min(20rem, calc(100vw - 2rem))',
          padding: '0.75rem',
          // Same overlap as the navigation popup: the card is a sibling of
          // the trigger, and the wrap is what closes on leave.
          marginTop: '-5px',
          paddingTop: 'calc(0.75rem + 5px)',
          background: onAccent,
          border: `1px solid ${line}`,
          borderRadius: '10px',
          boxShadow: t.shadow.lg,
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
      files: Style.self({
        position: 'relative',
        display: 'grid',
        gap: '0.25rem',
        maxWidth: '24rem',
      }),
      row: Style.compose(
        Style.self({ paddingBlock: '0.375rem', paddingInline: '0.75rem', cursor: 'context-menu' }),
        focus,
      ),
      popup: Style.compose(
        Style.self({
          position: 'absolute',
          top: underTrigger,
          left: '0',
          zIndex: '10',
          display: 'grid',
          minWidth: '10rem',
          background: onAccent,
          border: `1px solid ${line}`,
          borderRadius: '10px',
          boxShadow: t.shadow.lg,
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
        position: 'relative',
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
          position: 'absolute',
          top: underTrigger,
          left: '0',
          zIndex: '10',
          display: 'grid',
          minWidth: '12rem',
          background: onAccent,
          border: `1px solid ${line}`,
          borderRadius: '10px',
          boxShadow: t.shadow.lg,
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

export const navigationMenuStyle = (slots: typeof NavigationMenuSlots) =>
  Style.forSlots(slots)(
    {
      bar: Style.self({ position: 'relative', maxWidth: '28rem' }),
      trigger: Style.compose(control, focus),
      popup: Style.compose(
        Style.self({
          position: 'absolute',
          top: underTrigger,
          left: '0',
          zIndex: '10',
          display: 'grid',
          minWidth: '12rem',
          background: onAccent,
          border: `1px solid ${line}`,
          borderRadius: '10px',
          boxShadow: t.shadow.lg,
          padding: '0.25rem',
          // The box overlaps the trigger by a pixel, so moving into the menu
          // does not leave the bar. The extra padding keeps the items where
          // the 4px gap put them.
          marginTop: '-5px',
          paddingTop: 'calc(0.25rem + 5px)',
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
    { name: 'ShowcaseNavigationMenu' },
  )

export const paletteStyle = (slots: typeof PaletteSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: '0.5rem', maxWidth: '28rem' }),
      trigger: Style.compose(control, focus),
      backdrop: modalBackdrop,
      panel: Style.compose(
        modalPanel('28rem'),
        Style.self({
          top: '20%',
          translate: '-50% 0',
          gap: '0.5rem',
          padding: '0.75rem',
        }),
        focus,
      ),
      input: Style.compose(control, focus, Style.self({ width: '100%' })),
      list: Style.self({ display: 'grid', maxHeight: '16rem', overflow: 'auto' }),
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
    { name: 'ShowcasePalette' },
  )

export const sidebarStyle = (slots: typeof SidebarSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: '0.5rem', maxWidth: '18rem' }),
      nav: Style.self({ display: 'grid', gap: '0.25rem' }),
      section: Style.self({ display: 'grid' }),
      collapse: Style.compose(control, focus),
      trigger: Style.compose(
        Style.self({ display: 'block', width: '100%', textAlign: 'start' }),
        control,
        focus,
        Style.states({ true: { borderColor: ink } }, 'aria-expanded'),
      ),
      content: Style.self({
        margin: '0',
        paddingInlineStart: '1rem',
        listStyle: 'none',
        display: 'grid',
        gap: '0.25rem',
      }),
      link: Style.compose(
        Style.self({ color: muted, textDecoration: 'none' }),
        focus,
        Style.pseudo(':hover', { color: ink, textDecoration: 'underline' }),
      ),
    },
    { name: 'ShowcaseSidebar' },
  )

export const resizableStyle = (slots: typeof ResizableSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'flex', gap: '0.5rem', maxWidth: '40rem', minHeight: '12rem' }),
      first: Style.self({ minWidth: '0' }),
      handle: Style.compose(
        Style.self({
          flex: 'none',
          width: '0.625rem',
          borderRadius: '9999px',
          background: line,
          cursor: 'col-resize',
        }),
        focus,
        Style.pseudo(':hover', { background: accent }),
      ),
      second: Style.self({ minWidth: '0', color: muted }),
    },
    { name: 'ShowcaseResizable' },
  )
