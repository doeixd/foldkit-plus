/**
 * Compile-time contract of the short forms: a declarations object and a list
 * as pieces, `Style.slots`, `AppStyle` and `Utilities`. Type-checked, not executed.
 */
import { Capability, Event, Style, type SlotsContract } from '../src/index.js'
import type { Slot as NamedSlot } from '../src/slot.js'
import { AppStyle } from '../src/app.js'
import { Theme } from '../src/theme.js'
import { Utilities as U } from '../src/utilities.js'
import { FieldSlots } from './fixture.js'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const assert = <T extends true>(): T => true as T

// A declarations object and a list are pieces wherever a slot's piece is taken.
Style.forSlots(FieldSlots)({ root: { color: 'red' }, input: [U.flex, { gap: '1px' }] })
Style.compose({ color: 'red' }, [Style.class('x'), { gap: '1px' }])
Style.forCapability(FieldSlots)(Capability.Focusable, { outline: '1px solid' })
Style.recipeFor(FieldSlots)({ base: { root: { color: 'red' } } })

// @ts-expect-error a misspelled property in a declarations piece.
Style.forSlots(FieldSlots)({ root: { color: 'red', colr: 'red' } })
// @ts-expect-error a misspelled property inside a list.
Style.forSlots(FieldSlots)({ root: [U.flex, { color: 'red', colr: 'red' }] })
// @ts-expect-error a misspelled property given to compose.
Style.compose({ paddng: '1rem' })
// @ts-expect-error declarations are string-valued.
Style.compose({ width: 3 })
// @ts-expect-error a StyleValue is made by Style, not written as an object.
Style.compose({ classes: ['x'], style: {} })

// Style.slots: a Container per piece, a Style.slot's own options otherwise.
const Page = Style.slots({
  root: { display: 'grid' },
  form: Style.slot({ events: [Event.Submit] }, [U.gap('sm')]),
  field: Style.slot({ capability: Capability.TextInput }),
})
assert<
  Equal<
    typeof Page.slots.root,
    NamedSlot<'root', typeof Capability.Container, readonly [], readonly [], readonly [], false>
  >
>()
assert<Equal<(typeof Page.slots.form)['events'], readonly [typeof Event.Submit]>>()
assert<Equal<(typeof Page.slots.field)['capability'], typeof Capability.TextInput>>()
const _contract: SlotsContract<{}> = Style.slots({}).slots
void _contract
// The style is keyed by the declared slots.
Style.forSlots(Page.slots)({ form: { gap: '1px' } })
// @ts-expect-error a slot Style.slots did not declare.
Style.forSlots(Page.slots)({ missing: { gap: '1px' } })

// @ts-expect-error a misspelled property in a Style.slots piece.
Style.slots({ root: { colr: 'red', color: 'red' } })
// @ts-expect-error a misspelled property in a list in Style.slots.
Style.slots({ root: [U.flex, { colr: 'red', color: 'red' }] })
// @ts-expect-error a misspelled property in a Style.slot piece.
Style.slots({ form: Style.slot({ events: [Event.Submit] }, { colr: 'red', color: 'red' }) })
// @ts-expect-error an application's own slot is not hidden.
Style.slot({ hidden: true })
// @ts-expect-error a misspelled slot option.
Style.slot({ event: [Event.Submit] })

// AppStyle: references typed by the theme; the layer is the application's.
const app = AppStyle.make({ palette: Theme.oklch({ accent: { h: 0, c: 0, l: '50%' } }) })
app.t.space.md
app.t.surface.base
// @ts-expect-error a token the theme lacks.
app.t.surface.missing
app.slots({ root: { color: app.t.text.muted } }, { name: 'Page' })
// @ts-expect-error the layer is fixed by the kit.
app.slots({ root: {} }, { layer: app.L.layer('components') })
app.forSlots(FieldSlots)({ root: { color: 'red' } }, { name: 'Field' })
// @ts-expect-error the layer is fixed by the kit.
app.forSlots(FieldSlots)({ root: {} }, { layer: app.L.layer('components') })
// @ts-expect-error a slot the contract lacks.
app.forSlots(FieldSlots)({ missing: {} })
// @ts-expect-error a color scheme `Theme.root` does not write.
AppStyle.make({ palette: {}, colorScheme: 'dark light' })

// Utilities: a step is a token name of the shipped scales.
U.p('md')
U.m('auto')
U.bg('accent.on-fill')
// @ts-expect-error a space step the scale lacks.
U.p('4xl')
// @ts-expect-error padding cannot be auto.
U.p('auto')
// @ts-expect-error a size the scale lacks.
U.text('6xl')
// @ts-expect-error a weight the scale lacks.
U.font('black')
// @ts-expect-error a color the palette lacks.
U.bg('surface.missing')
// @ts-expect-error a knob is not a color.
U.color('knob.accent-h')
// @ts-expect-error an alignment flexbox lacks.
U.justify('space-between')
