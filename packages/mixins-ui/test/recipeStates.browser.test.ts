/// <reference types="@vitest/browser-playwright" />
/**
 * The state matrix of the form recipes, read from computed style: for each
 * control, across every look it has, the pairs of states that must differ do
 * (an invalid edge from the resting one, a focus-visible ring from none, a
 * disabled control from an enabled one, a hovered one from a resting one, a
 * checked one from an unchecked one) and the pair that must not does not (a
 * disabled control under the pointer from a disabled one away from it).
 *
 * Hover and focus are forced on the node through the protocol, so the one real
 * pointer every browser test file shares cannot move them. A pair that does
 * not differ is a finding in the recipe, listed in `known` with the control and
 * state named and committed as `test.fails`.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import {
  ButtonSlots,
  CheckboxSlots,
  ComboboxSlots,
  InputSlots,
  ListboxSlots,
  NumberFieldSlots,
  OtpFieldSlots,
  RadioGroupSlots,
  Recipes,
  SegmentedSlots,
  SelectSlots,
  SliderSlots,
  SwitchSlots,
  Textarea,
  TextareaSlots,
} from '../src/index.js'
import { unitKnobs } from './fixture.js'
import { nodeOf } from './pseudoState.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard

type State = 'hover' | 'focus' | 'disabled' | 'invalid' | 'checked'

/** What a draw is asked to put on the control: the state it stands in. */
interface Flags {
  readonly disabled: boolean
  readonly invalid: boolean
  readonly checked: boolean
}

interface Look {
  readonly label: string
  readonly css: string
  /** Draws the control, its element read marked `data-case=id`. */
  readonly draw: (h: HtmlBuilder<never>, id: string, on: Flags) => Html
}

interface Control {
  readonly name: string
  readonly states: ReadonlyArray<State>
  /** What forcing focus on the read element means: `:focus-visible`, or the `:focus-within` of a group. */
  readonly focusing: ReadonlyArray<'focus' | 'focus-visible' | 'focus-within'>
  /** A descendant whose own opacity also counts as the control dimming. */
  readonly inner?: string
  readonly looks: ReadonlyArray<Look>
  /** Pairs that do not differ, each `state` or `state:look`, listed where they are findings. */
  readonly known?: ReadonlyArray<string>
}

const look = (
  label: string,
  style: { readonly css: string },
  draw: (h: HtmlBuilder<never>, id: string, on: Flags) => Html,
): Look => ({ label, css: style.css, draw })

// Controls ---------------------------------------------------------------------------

const buttons: ReadonlyArray<Look> = (['solid', 'outline', 'ghost', 'primary', 'icon'] as const)
  .flatMap(variant => (['accent', 'neutral', 'danger'] as const).map(tone => ({ variant, tone })))
  .map(selection => {
    const style = Style.forSlots(ButtonSlots)(Recipes.Button(selection))
    return look(`${selection.variant}/${selection.tone}`, style, (h, id, on) => {
      const b = SlotView.buildersFor(ButtonSlots, [style.mixin], { input: undefined, h })
      return h.button(
        b.button.attrs([
          h.Type('button'),
          h.DataAttribute('case', id),
          ...(on.disabled ? [h.AriaDisabled(true)] : []),
          ...(on.checked ? [h.AriaPressed('true')] : []),
        ]),
        ['Go'],
      )
    })
  })

const fieldLooks = (variants: ReadonlyArray<'outline' | 'filled'>) => variants

const inputs = fieldLooks(['outline', 'filled']).map(variant => {
  const style = Style.forSlots(InputSlots)(Recipes.Input({ variant }))
  return look(variant, style, (h, id, on) => {
    const b = SlotView.buildersFor(InputSlots, [style.mixin], { input: undefined, h })
    return h.input(
      b.input.attrs([
        h.Type('text'),
        h.AriaLabel('Name'),
        h.DataAttribute('case', id),
        ...(on.disabled ? [h.Disabled(true)] : []),
        ...(on.invalid ? [h.AriaInvalid(true)] : []),
      ]),
    )
  })
})

const textareas = fieldLooks(['outline', 'filled']).map(variant => {
  const style = Style.forSlots(TextareaSlots)(Recipes.Textarea({ variant }))
  return look(variant, style, (h, id, on) =>
    Textarea.view(
      {
        id: `bio-${variant}`,
        invalid: on.invalid,
        disabled: on.disabled,
        style,
        draw: ({ textarea }, inner) =>
          inner.textarea([...textarea, inner.DataAttribute('case', id)]),
      },
      h,
    ),
  )
})

const selects = fieldLooks(['outline', 'filled']).map(variant => {
  const style = Style.forSlots(SelectSlots)(Recipes.Select({ variant }))
  return look(variant, style, (h, id, on) => {
    const b = SlotView.buildersFor(SelectSlots, [style.mixin], { input: undefined, h })
    return h.select(
      b.select.attrs([
        h.AriaLabel('Region'),
        h.DataAttribute('case', id),
        ...(on.disabled ? [h.Disabled(true)] : []),
        ...(on.invalid ? [h.AriaInvalid(true)] : []),
      ]),
      [h.option([h.Value('eu')], ['Europe'])],
    )
  })
})

const listboxes = (['outline', 'filled', 'ghost'] as const).map(trigger => {
  const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({ trigger }))
  return look(trigger, style, (h, id, on) => {
    const b = SlotView.buildersFor(ListboxSlots, [style.mixin], { input: undefined, h })
    return h.div(b.wrapper.attrs([]), [
      h.button(
        b.button.attrs([
          h.Type('button'),
          h.AriaHasPopup('listbox'),
          h.DataAttribute('case', id),
          ...(on.disabled ? [h.AriaDisabled(true)] : []),
          ...(on.invalid ? [h.AriaInvalid(true)] : []),
        ]),
        ['Frequency'],
      ),
    ])
  })
})

const comboboxes = (['trigger', 'auto'] as const).map(width => {
  const style = Style.forSlots(ComboboxSlots)(Recipes.Combobox({ width }))
  return look(width, style, (h, id, on) => {
    const b = SlotView.buildersFor(ComboboxSlots, [style.mixin], { input: undefined, h })
    return h.div(b.wrapper.attrs([]), [
      h.div(b.inputWrapper.attrs([h.DataAttribute('case', id)]), [
        h.input(
          b.input.attrs([
            h.Role('combobox'),
            h.AriaLabel('Fruit'),
            ...(on.disabled ? [h.Disabled(true)] : []),
            ...(on.invalid ? [h.AriaInvalid(true)] : []),
          ]),
        ),
      ]),
    ])
  })
})

const checkboxes = (['accent', 'neutral'] as const).map(tone => {
  const style = Style.forSlots(CheckboxSlots)(Recipes.Checkbox({ tone }))
  return look(tone, style, (h, id, on) => {
    const b = SlotView.buildersFor(CheckboxSlots, [style.mixin], { input: undefined, h })
    return h.button(
      b.checkbox.attrs([
        h.Type('button'),
        h.Role('checkbox'),
        h.AriaLabel('Agree'),
        h.AriaChecked(on.checked),
        h.DataAttribute('case', id),
        ...(on.disabled ? [h.AriaDisabled(true)] : []),
        ...(on.invalid ? [h.AriaInvalid(true)] : []),
      ]),
      [],
    )
  })
})

const switches = (['accent', 'neutral'] as const).map(tone => {
  const style = Style.forSlots(SwitchSlots)(Recipes.Switch({ tone }))
  return look(tone, style, (h, id, on) => {
    const b = SlotView.buildersFor(SwitchSlots, [style.mixin], { input: undefined, h })
    return h.button(
      b.button.attrs([
        h.Type('button'),
        h.Role('switch'),
        h.AriaLabel('Lamp'),
        h.AriaChecked(on.checked),
        h.DataAttribute('case', id),
        ...(on.disabled ? [h.AriaDisabled(true)] : []),
        ...(on.invalid ? [h.AriaInvalid(true)] : []),
      ]),
      [],
    )
  })
})

const radios = (['plain', 'card'] as const).map(variant => {
  const style = Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup({ variant }))
  return look(variant, style, (h, id, on) => {
    const b = SlotView.buildersFor(RadioGroupSlots, [style.mixin], { input: undefined, h })
    return h.div(
      b.group.attrs([
        h.Role('radiogroup'),
        h.AriaLabel('Pick'),
        ...(on.invalid ? [h.AriaInvalid(true)] : []),
      ]),
      [
        h.button(
          b.option.attrs([
            h.Type('button'),
            h.Role('radio'),
            h.AriaLabel('A'),
            h.AriaChecked(on.checked),
            h.DataAttribute('case', id),
            ...(on.disabled ? [h.AriaDisabled(true)] : []),
          ]),
          [],
        ),
      ],
    )
  })
})

const segmenteds = (['tray', 'plain', 'underline'] as const).map(tray => {
  const style = Style.forSlots(SegmentedSlots)(Recipes.Segmented({ tray }))
  return look(tray, style, (h, id, on) => {
    const b = SlotView.buildersFor(SegmentedSlots, [style.mixin], { input: undefined, h })
    return h.div(b.group.attrs([h.Role('radiogroup'), h.AriaLabel('View')]), [
      h.button(
        b.option.attrs([
          h.Type('button'),
          h.Role('radio'),
          h.AriaChecked(on.checked),
          h.DataAttribute('case', id),
          ...(on.disabled ? [h.Disabled(true)] : []),
        ]),
        ['Grid'],
      ),
    ])
  })
})

const sliders = (['accent', 'neutral'] as const).map(tone => {
  const style = Style.forSlots(SliderSlots)(Recipes.Slider({ tone }))
  return look(tone, style, (h, id, on) => {
    const b = SlotView.buildersFor(SliderSlots, [style.mixin], { input: undefined, h })
    return h.div(
      b.root.attrs([
        h.DataAttribute('case', id),
        ...(on.disabled ? [h.DataAttribute('disabled', '')] : []),
      ]),
      [
        h.input([
          h.Type('range'),
          h.AriaLabel('Volume'),
          ...(on.disabled ? [h.Disabled(true)] : []),
        ]),
      ],
    )
  })
})

const numberFields = [
  (() => {
    const style = Style.forSlots(NumberFieldSlots)(Recipes.NumberField({}))
    return look('default', style, (h, id, on) => {
      const b = SlotView.buildersFor(NumberFieldSlots, [style.mixin], { input: undefined, h })
      return h.div(b.group.attrs([h.DataAttribute('case', id)]), [
        h.input(b.input.attrs([h.AriaLabel('Count'), ...(on.disabled ? [h.Disabled(true)] : [])])),
      ])
    })
  })(),
]

const otps = [
  (() => {
    const style = Style.forSlots(OtpFieldSlots)(Recipes.OtpField({}))
    return look('default', style, (h, id, on) => {
      const b = SlotView.buildersFor(OtpFieldSlots, [style.mixin], { input: undefined, h })
      return h.div(b.group.attrs([]), [
        h.div(
          b.cell.attrs([
            h.DataAttribute('case', id),
            ...(on.invalid ? [h.DataAttribute('invalid', '')] : []),
            ...(on.disabled ? [h.DataAttribute('disabled', '')] : []),
          ]),
          ['1'],
        ),
      ])
    })
  })(),
]

const CONTROLS: ReadonlyArray<Control> = [
  {
    name: 'Button',
    states: ['hover', 'focus', 'disabled', 'checked'],
    focusing: ['focus', 'focus-visible'],
    looks: buttons,
  },
  {
    name: 'Input',
    states: ['hover', 'focus', 'disabled', 'invalid'],
    focusing: ['focus', 'focus-visible'],
    looks: inputs,
  },
  {
    name: 'Textarea',
    states: ['hover', 'focus', 'disabled', 'invalid'],
    focusing: ['focus', 'focus-visible'],
    looks: textareas,
  },
  {
    name: 'Select',
    states: ['hover', 'focus', 'disabled', 'invalid'],
    focusing: ['focus', 'focus-visible'],
    looks: selects,
  },
  {
    name: 'Listbox trigger',
    states: ['hover', 'focus', 'disabled', 'invalid'],
    focusing: ['focus', 'focus-visible'],
    looks: listboxes,
  },
  {
    name: 'Combobox field',
    states: ['hover', 'focus', 'disabled', 'invalid'],
    focusing: ['focus-within'],
    inner: 'input',
    looks: comboboxes,
  },
  {
    name: 'Checkbox',
    states: ['focus', 'disabled', 'invalid', 'checked'],
    focusing: ['focus', 'focus-visible'],
    looks: checkboxes,
  },
  {
    name: 'Switch',
    states: ['focus', 'disabled', 'invalid', 'checked'],
    focusing: ['focus', 'focus-visible'],
    looks: switches,
  },
  {
    name: 'RadioGroup option',
    states: ['focus', 'disabled', 'invalid', 'checked'],
    focusing: ['focus', 'focus-visible'],
    looks: radios,
  },
  {
    name: 'Segmented option',
    states: ['hover', 'focus', 'disabled', 'checked'],
    focusing: ['focus', 'focus-visible'],
    looks: segmenteds,
  },
  {
    name: 'Slider',
    states: ['disabled'],
    focusing: ['focus', 'focus-visible'],
    inner: 'input',
    looks: sliders,
  },
  {
    name: 'NumberField group',
    states: ['hover', 'focus', 'disabled'],
    focusing: ['focus-within'],
    inner: 'input',
    looks: numberFields,
  },
  {
    name: 'OtpField cell',
    states: ['disabled', 'invalid'],
    focusing: ['focus', 'focus-visible'],
    looks: otps,
  },
]

// Reading -----------------------------------------------------------------------------

interface Reading {
  readonly edge: string
  readonly ring: string
  readonly shadow: string
  readonly fill: string
  readonly ink: string
  readonly opacity: string
  readonly innerOpacity: string
  readonly cursor: string
  readonly motion: string
}

const read = (element: HTMLElement, inner: string | undefined): Reading => {
  const style = getComputedStyle(element)
  const within = inner === undefined ? null : element.querySelector(inner)
  return {
    edge: [
      style.borderTopColor,
      style.borderRightColor,
      style.borderBottomColor,
      style.borderLeftColor,
      style.borderTopWidth,
    ].join(' '),
    ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
    shadow: style.boxShadow,
    fill: `${style.backgroundColor} ${style.backgroundImage}`,
    ink: style.color,
    opacity: style.opacity,
    innerOpacity: within === null ? '' : getComputedStyle(within).opacity,
    cursor: style.cursor,
    motion: `${style.translate} ${style.scale} ${style.filter}`,
  }
}

const differs = (a: Reading, b: Reading, keys: ReadonlyArray<keyof Reading>): boolean =>
  keys.some(key => a[key] !== b[key])

const FLAGS: Readonly<Record<'rest' | State | 'disabledHover', Flags>> = {
  rest: { disabled: false, invalid: false, checked: false },
  hover: { disabled: false, invalid: false, checked: false },
  focus: { disabled: false, invalid: false, checked: false },
  disabled: { disabled: true, invalid: false, checked: false },
  invalid: { disabled: false, invalid: true, checked: false },
  checked: { disabled: false, invalid: false, checked: true },
  disabledHover: { disabled: true, invalid: false, checked: false },
}

const CASES = ['rest', 'hover', 'focus', 'disabled', 'invalid', 'checked', 'disabledHover'] as const

const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const waitStill = async (element: HTMLElement) => {
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
  await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished))
}

/** Every problem found for a control, as `state:look` strings. */
const check = async (control: Control): Promise<ReadonlyArray<string>> => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    control.looks.map(each => each.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'recipe-states'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ display: 'grid', gap: '12px', padding: '12px' })],
          control.looks.flatMap((each, index) =>
            CASES.map(name =>
              h.div([h.Style({ padding: '8px' })], [each.draw(h, `${index}:${name}`, FLAGS[name])]),
            ),
          ),
        ),
    }),
  )
  const problems: Array<string> = []
  try {
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[data-case]')).toHaveLength(
        control.looks.length * CASES.length,
      ),
    )
    const at = (index: number, name: string) =>
      document.querySelector<HTMLElement>(`[data-case="${index}:${name}"]`)!
    const forced = async (index: number, name: string, states: ReadonlyArray<string>) => {
      const node = await nodeOf(`[data-case="${index}:${name}"]`)
      await cdp().send('CSS.forcePseudoState', { nodeId: node, forcedPseudoClasses: [...states] })
      await waitStill(at(index, name))
      return read(at(index, name), control.inner)
    }
    for (const [index, each] of control.looks.entries()) {
      const rest = read(at(index, 'rest'), control.inner)
      const note = (state: string, text: string) => problems.push(`${state}:${each.label} ${text}`)
      if (control.states.includes('hover')) {
        const hovered = await forced(index, 'hover', ['hover'])
        if (!differs(hovered, rest, ['edge', 'fill', 'shadow', 'ink', 'motion', 'ring']))
          note('hover', 'looks as it does at rest')
      }
      if (control.states.includes('focus')) {
        const focused = await forced(index, 'focus', control.focusing)
        if (!differs(focused, rest, ['ring', 'shadow', 'edge']))
          note('focus', 'has no ring or edge beyond rest')
      }
      if (control.states.includes('disabled')) {
        const off = read(at(index, 'disabled'), control.inner)
        if (!differs(off, rest, ['opacity', 'innerOpacity', 'ink', 'fill', 'cursor']))
          note('disabled', 'looks as it does enabled')
        const offHovered = await forced(index, 'disabledHover', ['hover'])
        if (differs(offHovered, off, Object.keys(off) as Array<keyof Reading>))
          note('disabledHover', 'changes under the pointer')
      }
      if (control.states.includes('invalid')) {
        const bad = read(at(index, 'invalid'), control.inner)
        if (!differs(bad, rest, ['edge', 'ring', 'shadow', 'fill']))
          note('invalid', 'has no edge, ring or fill beyond rest')
      }
      if (control.states.includes('checked')) {
        const on = read(at(index, 'checked'), control.inner)
        if (!differs(on, rest, ['edge', 'fill', 'shadow', 'ink']))
          note('checked', 'looks as it does unchecked')
      }
    }
  } finally {
    handle.dispose()
  }
  return problems
}

const found = new Map<string, Promise<ReadonlyArray<string>>>()
const problemsOf = (control: Control) => {
  const cached = found.get(control.name)
  if (cached !== undefined) return cached
  const fresh = check(control)
  found.set(control.name, fresh)
  return fresh
}

describe('the state matrix', () => {
  for (const control of CONTROLS) {
    const known = control.known ?? []
    const isKnown = (problem: string) =>
      known.some(entry => problem.startsWith(entry.includes(':') ? entry : `${entry}:`))
    test(`${control.name}: every state it has reads differently from rest, in every look`, async () => {
      const problems = await problemsOf(control)
      expect(problems.filter(problem => !isKnown(problem)).join(' | ')).toBe('')
    })
    for (const entry of known) {
      test.fails(`${control.name}: ${entry}`, async () => {
        const problems = await problemsOf(control)
        expect(
          problems.filter(problem => problem.startsWith(entry.includes(':') ? entry : `${entry}:`)),
        ).toEqual([])
      })
    }
  }
})
