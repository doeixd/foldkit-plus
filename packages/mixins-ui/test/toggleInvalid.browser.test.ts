/**
 * An invalid Checkbox, Switch or RadioGroup, read from computed style in
 * every tone and state: the error edge shows at rest, checked and disabled,
 * and a valid control shows none. A tone is a variant, so each state rule has
 * to stand beside it rather than under it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { CheckboxSlots, RadioGroupSlots, Recipes, SwitchSlots } from '../src/index.js'
import { ref } from '../src/recipes/design.js'

const tones = ['accent', 'neutral'] as const
type Tone = (typeof tones)[number]
type State = 'rest' | 'invalid' | 'checked' | 'checked+invalid' | 'disabled+invalid'
const states: ReadonlyArray<State> = [
  'rest',
  'invalid',
  'checked',
  'checked+invalid',
  'disabled+invalid',
]

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const idOf = (kind: string, tone: Tone, state: State) => `${kind}-${tone}-${state}`

const mount = () => {
  const checkbox = (tone: Tone) => Style.forSlots(CheckboxSlots)(Recipes.Checkbox({ tone }))
  const toggle = (tone: Tone) => Style.forSlots(SwitchSlots)(Recipes.Switch({ tone }))
  const radio = (tone: Tone) => Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup({ tone }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    tones.map(tone => checkbox(tone).css + toggle(tone).css + radio(tone).css).join('') +
    // Still, so a state is read where it ends rather than mid-transition.
    ':root{--fk-knob-motion:0}'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'toggle-invalid'
  document.body.append(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const on = (state: State) => state.startsWith('checked')
    const bad = (state: State) => state.includes('invalid')
    const off = (state: State) => state === 'disabled+invalid'
    return h.div(
      [],
      tones.flatMap(tone => {
        const c = SlotView.buildersFor(CheckboxSlots, [checkbox(tone).mixin], {
          input: undefined,
          h,
        })
        const s = SlotView.buildersFor(SwitchSlots, [toggle(tone).mixin], { input: undefined, h })
        const r = SlotView.buildersFor(RadioGroupSlots, [radio(tone).mixin], {
          input: undefined,
          h,
        })
        return states.flatMap(state => [
          h.button(
            c.checkbox.attrs([
              h.Id(idOf('checkbox', tone, state)),
              h.Role('checkbox'),
              h.AriaChecked(on(state)),
              ...(bad(state) ? [h.AriaInvalid(true)] : []),
              ...(off(state) ? [h.AriaDisabled(true)] : []),
            ]),
            [],
          ),
          h.button(
            s.button.attrs([
              h.Id(idOf('switch', tone, state)),
              h.Role('switch'),
              h.AriaChecked(on(state)),
              ...(bad(state) ? [h.AriaInvalid(true)] : []),
              ...(off(state) ? [h.AriaDisabled(true)] : []),
            ]),
            [],
          ),
          h.div(
            r.group.attrs([h.Role('radiogroup'), ...(bad(state) ? [h.AriaInvalid(true)] : [])]),
            [
              h.button(
                r.option.attrs([
                  h.Id(idOf('radio', tone, state)),
                  h.Role('radio'),
                  h.AriaChecked(on(state)),
                  ...(off(state) ? [h.AriaDisabled(true)] : []),
                ]),
                [],
              ),
            ],
          ),
        ])
      }),
    )
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
}

const read = (kind: string, tone: Tone, state: State) =>
  getComputedStyle(document.getElementById(idOf(kind, tone, state))!)

/** The edge colour the error token paints, as the browser serializes it. */
const errorEdge = () => {
  const probe = document.createElement('i')
  probe.style.border = `1px solid ${ref.error.outline}`
  document.body.append(probe)
  const color = getComputedStyle(probe).borderTopColor
  probe.remove()
  return color
}

const drawn = () =>
  vi.waitFor(() =>
    expect(document.getElementById(idOf('radio', 'neutral', 'disabled+invalid'))).not.toBeNull(),
  )

const invalid = (state: State) => state.includes('invalid')

for (const tone of tones) {
  for (const state of states) {
    const expected = invalid(state) ? 'the error edge' : 'no error edge'
    test(`${tone} checkbox, ${state}: ${expected}`, async () => {
      const handle = mount()
      try {
        await drawn()
        const edge = errorEdge()
        expect(read('checkbox', tone, state).borderTopColor === edge).toBe(invalid(state))
      } finally {
        handle.dispose()
      }
    })

    test(`${tone} radio, ${state}: ${expected}`, async () => {
      const handle = mount()
      try {
        await drawn()
        const edge = errorEdge()
        expect(read('radio', tone, state).borderTopColor === edge).toBe(invalid(state))
      } finally {
        handle.dispose()
      }
    })

    test(`${tone} switch, ${state}: ${expected}`, async () => {
      const handle = mount()
      try {
        await drawn()
        const edge = errorEdge()
        expect(read('switch', tone, state).boxShadow.includes(edge)).toBe(invalid(state))
      } finally {
        handle.dispose()
      }
    })
  }
}

test('an invalid checked checkbox keeps its checked fill', async () => {
  const handle = mount()
  try {
    await drawn()
    for (const tone of tones) {
      expect(read('checkbox', tone, 'checked+invalid').backgroundColor).toBe(
        read('checkbox', tone, 'checked').backgroundColor,
      )
    }
  } finally {
    handle.dispose()
  }
})
