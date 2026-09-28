/**
 * The waitlist form's appearance, as `foldkit-mixins` data. `main.ts` publishes
 * the Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, InputSlots, Recipes, TextareaSlots } from 'foldkit-mixins-ui'
import * as FieldValidation from 'foldkit/fieldValidation'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** Blue, as upstream's Tailwind `blue-500`, over near-neutral grey surfaces. */
const palette = Theme.oklch({
  accent: { h: 260, c: 0.21, l: '62%' },
  surfaceSaturation: 0.003,
})

/** A white base, so the card stands out from the page's `surface.muted`. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

const banner = (tone: typeof t.success): StyleValue =>
  Style.self({
    marginBlockStart: t.space.md,
    padding: t.space.sm,
    border: `${t.border.thin} solid ${tone.outline}`,
    borderRadius: t.radius.lg,
    background: tone.subtle,
    color: tone.ink,
  })

const spin = Style.keyframes({ to: { transform: 'rotate(360deg)' } })

// PAGE

export const PageSlots = Slots.define({
  page: container,
  card: container,
  title: container,
  form: container,
  field: container,
  fieldHeader: container,
  /** Beside a label while the email is being checked. */
  checkingMark: container,
  /** Beside a label once its field is valid. */
  validMark: container,
  success: container,
  failure: container,
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.self({
      boxSizing: 'border-box',
      minHeight: '100vh',
      paddingBlock: t.space.xl,
      paddingInline: t.space.md,
      background: t.surface.muted,
    }),
    card: Style.self({
      boxSizing: 'border-box',
      maxWidth: '28rem',
      marginInline: 'auto',
      padding: t.space.lg,
      borderRadius: t.radius.xl,
      background: t.surface.base,
      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
    }),
    title: Style.self({
      margin: `0 0 ${t.space.xl}`,
      textAlign: 'center',
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      color: t.text.default,
    }),
    form: L.in('layouts', Layout.stack({ gap: t.space.md })),
    field: Style.self({ marginBlockEnd: t.space.md }),
    fieldHeader: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
      Style.self({ marginBlockEnd: t.space.xs }),
    ),
    // Upstream asks Tailwind to spin an inline span, which a transform leaves
    // still; an inline-block turns.
    checkingMark: Style.compose(
      spin.style,
      Style.self({
        display: 'inline-block',
        fontSize: t.size.sm,
        color: t.accent.default,
        animation: `${spin.name} 1s linear infinite`,
      }),
    ),
    validMark: Style.self({ fontSize: t.size.sm, color: t.success.default }),
    success: banner(t.success),
    failure: banner(t.error),
  },
  { name: 'PageStyle', layer: app },
)

// FIELDS

type FieldState = FieldValidation.Field<string>

/** What a field's border and words say about it, as upstream's `borderClass` does. */
type Tone = 'idle' | 'checking' | 'valid' | 'invalid'

const toneOf = (field: FieldState): Tone =>
  FieldValidation.match(field, {
    onNotValidated: () => 'idle',
    onValidating: () => 'checking',
    onValid: () => 'valid',
    onInvalid: () => 'invalid',
  })

const whenTone = (tone: Tone, piece: StyleValue): StyleValue =>
  Style.whenInput<FieldState>(field => toneOf(field) === tone, piece)

/** The recipe already draws an invalid control's border from `aria-invalid`. */
const control: StyleValue = Style.compose(
  whenTone('checking', Style.self({ borderColor: t.accent.default })),
  whenTone('valid', Style.self({ borderColor: t.success.default })),
)

const label: StyleValue = Style.self({
  marginBlockEnd: '0',
  fontWeight: t.weight.medium,
  color: t.text.subtle,
})

/** "Checking..." in blue, the first error in red. */
const description: StyleValue = Style.compose(
  Style.self({ display: 'block', marginBlockStart: t.space['2xs'] }),
  whenTone('checking', Style.self({ color: t.accent.ink })),
  whenTone('invalid', Style.self({ color: t.error.ink })),
)

/** The shipped text-field recipes, their border and description following the field's state. */
export const InputStyle = Style.forSlots(InputSlots)(
  Recipes.Input.extend({ base: { input: control, label, description } })(),
  { name: 'InputStyle', layer: app },
)

export const TextareaStyle = Style.forSlots(TextareaSlots)(
  Recipes.Textarea.extend({ base: { textarea: control, label, description } })(),
  { name: 'TextareaStyle', layer: app },
)

// BUTTON

/** The shipped solid button, full width, and grey while it cannot submit. */
const SubmitButton = Recipes.Button.extend({
  base: {
    button: Style.compose(
      Style.self({ width: '100%' }),
      // `@foldkit/ui` marks a disabled button with `aria-disabled`, not `disabled`.
      Style.pseudo('[aria-disabled="true"]', {
        opacity: '1',
        background: t.surface.default,
        color: t.text.muted,
      }),
    ),
  },
})

export const SubmitButtonStyle = Style.forSlots(ButtonSlots)(SubmitButton(), {
  name: 'SubmitButtonStyle',
  layer: app,
})

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. The slot styles' own classes are injected when a Slot
 * first draws them, so they are not repeated here. `colorScheme: 'light'`
 * keeps the page light in a dark browser, as upstream's is.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)
