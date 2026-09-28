/**
 * The waitlist form's appearance, as `foldkit-mixins` data. `main.ts` draws the
 * markup through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, InputSlots, Recipes, TextareaSlots } from 'foldkit-mixins-ui'
import * as FieldValidation from 'foldkit/fieldValidation'

/** Blue, as upstream's Tailwind `blue-500`, over near-neutral grey surfaces. */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({
      accent: { h: 260, c: 0.21, l: '62%' },
      surfaceSaturation: 0.003,
    }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

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

export const FormPage = slots(
  {
    page: [
      U.py('xl'),
      U.px('md'),
      U.bg('surface.muted'),
      { boxSizing: 'border-box', minHeight: '100vh' },
    ],
    card: [
      U.p('lg'),
      U.rounded('xl'),
      U.bg('surface.base'),
      {
        boxSizing: 'border-box',
        maxWidth: '28rem',
        marginInline: 'auto',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
      },
    ],
    title: [
      U.textCenter,
      U.text('3xl'),
      U.font('bold'),
      U.color('text.default'),
      { margin: `0 0 ${t.space.xl}` },
    ],
    form: L.in('layouts', Layout.stack({ gap: t.space.md })),
    field: { marginBlockEnd: t.space.md },
    fieldHeader: [
      L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
      { marginBlockEnd: t.space.xs },
    ],
    // Upstream asks Tailwind to spin an inline span, which a transform leaves
    // still; an inline-block turns.
    // Beside a label while the email is being checked.
    checkingMark: [
      spin.style,
      U.text('sm'),
      U.color('accent.default'),
      {
        display: 'inline-block',
        animation: `${spin.name} 1s linear infinite`,
      },
    ],
    // Beside a label once its field is valid.
    validMark: [U.text('sm'), U.color('success.default')],
    success: banner(t.success),
    failure: banner(t.error),
  },
  { name: 'PageStyle' },
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
export const InputStyle = forSlots(InputSlots)(
  Recipes.Input.extend({ base: { input: control, label, description } })(),
  { name: 'InputStyle' },
)

export const TextareaStyle = forSlots(TextareaSlots)(
  Recipes.Textarea.extend({ base: { textarea: control, label, description } })(),
  { name: 'TextareaStyle' },
)

// BUTTON

/** The shipped solid button, full width, and grey while it cannot submit. */
const SubmitButton = Recipes.Button.extend({
  base: {
    button: [
      { width: '100%' },
      // `@foldkit/ui` marks a disabled button with `aria-disabled`, not `disabled`.
      Style.pseudo('[aria-disabled="true"]', {
        opacity: '1',
        background: t.surface.default,
        color: t.text.muted,
      }),
    ],
  },
})

export const SubmitButtonStyle = forSlots(ButtonSlots)(SubmitButton(), {
  name: 'SubmitButtonStyle',
})
