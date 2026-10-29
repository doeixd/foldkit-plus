/**
 * Slot, variant, token and knob names an application declares, named like an
 * `Object.prototype` member: each is kept as its own key and never read from
 * the prototype. `pnpm mutate packages/mixins/test/protoKey.mutations.ts`.
 */
import { describe, expect, it } from 'vitest'
import {
  Attributes,
  Capability,
  Mixin,
  Slot,
  Slots,
  SlotView,
  Style,
  type SlotAttributes,
  type StyleValue,
} from '../src/index.js'
import { Knob, Knobs, Theme } from '../src/theme.js'
import { h, type TestMessage } from './resolverFixture.js'

const keys: ReadonlyArray<string> = ['__proto__', 'constructor', 'toString']

const classOf = (attributes: SlotAttributes<TestMessage>): string =>
  Attributes.find(attributes, 'Class')?.value ?? ''

const classesOf = (value: StyleValue | undefined): ReadonlyArray<string> => value?.classes ?? []

const slotsNamed = (key: string) =>
  Slots.define({
    [key]: Slot.make({ capability: Capability.Container }),
    other: Slot.make({ capability: Capability.Base }),
  })

describe.each(keys)('a name %s', key => {
  it('selects a recipe axis by its default and matches its compound', () => {
    const recipe = Style.recipe({
      variants: { [key]: { big: Style.class('big') } },
      defaults: { [key]: 'big' },
      compound: [{ when: { [key]: 'big' }, style: Style.class('both') }],
    })
    expect(classesOf(recipe({}))).toEqual(['big', 'both'])
  })

  it('selects a slot recipe by its default, merges its pieces and matches its compound', () => {
    const recipe = Style.recipeFor(slotsNamed(key))({
      base: { [key]: Style.class('base') },
      variants: { [key]: { big: { [key]: Style.class('big') } } },
      defaults: { [key]: 'big' },
      compound: [{ when: { [key]: 'big' }, style: { [key]: Style.class('both') } }],
    })
    const selected: Readonly<Record<string, StyleValue | undefined>> = recipe()
    expect(Object.hasOwn(selected, key)).toBe(true)
    expect(classesOf(selected[key])).toEqual(['base', 'big', 'both'])
  })

  it('extends a slot recipe along an axis and value of that name', () => {
    const recipe = Style.recipeFor(slotsNamed(key))({
      variants: { [key]: { plain: { other: Style.class('plain') }, [key]: {} } },
    }).extend({ variants: { [key]: { [key]: { [key]: Style.class('added') } } } })
    const selected: Readonly<Record<string, StyleValue | undefined>> = recipe({ [key]: key })
    expect(classesOf(selected[key])).toEqual(['added'])
  })

  it('gives a piece to a slot of that name by its capability', () => {
    const style = Style.forCapability(slotsNamed(key))(Capability.Container, Style.class('fit'))
    const builders = SlotView.buildersFor(slotsNamed(key), [style.mixin], {
      input: undefined,
      h,
    })
    expect(classOf(builders[key]!.attrs())).toBe('fit')
  })

  it('finds no contribution for a slot of that name from a Mixin that skips it', () => {
    const made = Mixin.make<TestMessage>('Other', { other: { classes: ['other'] } })
    const styled = Style.forSlots(slotsNamed(key))({ other: Style.class('other') })
    expect(Mixin.contributionsFor(made, key)).toBeUndefined()
    expect(Mixin.contributionsFor(styled.mixin, key)).toBeUndefined()
  })

  it('composes, overrides and writes a token group and name of that name', () => {
    const composed = Theme.compose({ [key]: { a: '1' } }, { [key]: { [key]: '2' } })
    expect(Object.hasOwn(composed, key)).toBe(true)
    expect(composed[key]).toEqual({ a: '1', [key]: '2' })
    expect(Theme.scoped(composed, '.x', { [key]: { [key]: '3' } }).globalCss).toEqual([
      `.x{--fk-${key}-${key}:3}`,
    ])
    const written = Theme.root({ [key]: { [key]: 'v', name: 'w' } }, { omit: { other: {} } })
    expect(written.globalCss?.join('')).toContain(`--fk-${key}-${key}:v;--fk-${key}-name:w`)
  })

  it('reads, sets and prints a knob group and name of that name', () => {
    const knobs = {
      [key]: {
        [key]: Knob.percent({
          variable: 'glow',
          title: 'Glow',
          default: 20,
          min: 0,
          max: 100,
          step: 1,
          description: 'Glow',
        }),
      },
    }
    const unset = Theme.make(knobs, {})
    expect(Theme.variables(unset)).toEqual({ glow: '20%' })
    expect(Knobs.valueAt(knobs, unset.values, `${key}.${key}`)).toBe(20)
    expect(Theme.print(unset)).toBe('Theme.make({})')
    const set = Theme.set({ [key]: { [key]: 40 } })(unset)
    expect(Theme.variables(set)).toEqual({ glow: '40%' })
  })
})
