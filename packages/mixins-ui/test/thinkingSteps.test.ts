/**
 * Thinking Steps as markup and as rules: the trace's state from its steps,
 * open while it runs unless the reader said otherwise, the trigger's words
 * for each state, durations as a reader says them, and the ARIA a trace and
 * its steps carry (a button naming the list it shows, a shut part kept but
 * inert, each list named by what holds it, a state said in words).
 */
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  ThinkingStepsSlots,
  elapsed,
  shown,
  stateOf,
  view as drawSteps,
  type ThinkingStep,
  type ThinkingStepsView,
} from '../src/thinkingSteps.js'
import { ThinkingSteps } from '../src/recipes/thinkingSteps.js'
import { Patterns } from '../src/index.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const style = Style.forSlots(ThinkingStepsSlots)(ThinkingSteps({}))
const step = (id: string, state: ThinkingStep['state'], more: Partial<ThinkingStep> = {}) => ({
  id,
  title: `Step ${id}`,
  state,
  ...more,
})
const trace: ReadonlyArray<ThinkingStep> = [
  step('search', 'done', { duration: 1500, detail: 'Found 4 sources.' }),
  step('read', 'done', {
    duration: 2500,
    steps: [step('a', 'done', { duration: 1000 }), step('b', 'done', { duration: 1500 })],
  }),
]
const view = (options: Partial<ThinkingStepsView<TestMessage>>, builder = h) =>
  drawSteps(
    {
      id: 'trace',
      steps: trace,
      open: Option.none(),
      onToggle: open => message(open ? 'Clicked' : 'Other'),
      style,
      ...options,
    },
    builder,
  )
const byId = (drawn: ReturnType<typeof view>, id: unknown) =>
  Inert.all(drawn).find(node => Inert.value(node, 'id') === id)
const trigger = (drawn: ReturnType<typeof view>) => Inert.byTag(drawn, 'button')[0]

describe('ThinkingSteps.stateOf', () => {
  it.each([
    ['running while one runs', ['done', 'running'], 'running'],
    ['running while one runs after one failed', ['failed', 'running'], 'running'],
    ['running between steps', ['done', 'pending'], 'running'],
    ['running before any step', [], 'running'],
    ['failed once one failed and none runs', ['done', 'failed', 'pending'], 'failed'],
    ['done once every step is', ['done', 'done'], 'done'],
  ] as const)('%s', (_, states, state) => {
    expect(stateOf(states.map((each, n) => step(String(n), each)))).toBe(state)
  })
})

describe('ThinkingSteps.shown', () => {
  it.each([
    ['follows the work while it runs', Option.none(), 'running', true],
    ['follows the work once done', Option.none(), 'done', false],
    ['stays shut while it runs, once the reader shut it', Option.some(false), 'running', false],
    ['stays open once done, once the reader opened it', Option.some(true), 'done', true],
  ] as const)('%s', (_, open, state, expected) => {
    expect(shown(open, [step('x', state)])).toBe(expected)
  })
})

describe('ThinkingSteps.elapsed', () => {
  it.each([
    [400, '0.4s'],
    [1234, '1.2s'],
    [4000, '4s'],
    [12_400, '12s'],
    [59_600, '1m 0s'],
    [65_000, '1m 5s'],
  ])('says %ims as %s', (ms, words) => {
    expect(elapsed(ms)).toBe(words)
  })
})

describe('ThinkingSteps summary', () => {
  it.each([
    ['the running step’s title', [step('a', 'done'), step('b', 'running')], {}, 'Step b'],
    ['the latest running step’s title', [step('a', 'running'), step('b', 'running')], {}, 'Step b'],
    ['Thinking, between steps', [step('a', 'done'), step('b', 'pending')], {}, 'Thinking'],
    ['how long, summed from the steps', trace, {}, 'Thought for 4s'],
    ['how long, as given', trace, { duration: 9000 }, 'Thought for 9s'],
    ['that it thought, with no durations', [step('a', 'done')], {}, 'Thought'],
    [
      'how long before it stopped',
      [step('a', 'done', { duration: 800 }), step('b', 'failed', { duration: 1200 })],
      {},
      'Stopped after 2s',
    ],
    ['the application’s words', trace, { summary: 'Reasoned' }, 'Reasoned'],
  ] as const)('says %s', (_, steps, options, words) => {
    expect(Inert.text(trigger(view({ steps, ...options })))).toBe(words)
  })
})

describe('ThinkingSteps view', () => {
  it('meets its pattern: a button that shows the list it names', () => {
    expect(A11y.validate(Patterns.ThinkingSteps, ThinkingStepsSlots)).toEqual([])
  })

  it('shut, keeps the list drawn and inert, the trigger naming it', () => {
    const drawn = view({})
    const button = trigger(drawn)
    expect(Inert.value(button, 'aria-expanded')).toBe('false')
    const panel = byId(drawn, Inert.value(button, 'aria-controls'))
    expect(Inert.value(panel, 'inert')).toBe('')
    const [list] = Inert.byTag(panel, 'ol')
    expect(Inert.value(list, 'aria-labelledby')).toBe(Inert.value(button, 'id'))
  })

  it('open, the list is in reach', () => {
    const drawn = view({ open: Option.some(true) })
    expect(Inert.value(trigger(drawn), 'aria-expanded')).toBe('true')
    expect(Inert.value(byId(drawn, 'trace-panel'), 'inert')).toBeUndefined()
  })

  it('sends the state the reader asks for, not a flip of a frame-old one', () => {
    sends<TestMessage>(
      builder => view({ steps: [step('a', 'running')] }, builder),
      Scene.click(Scene.role('button', { name: 'Step a' })),
      Scene.expectOutMessage(message('Other')),
    )
    sends<TestMessage>(
      builder => view({}, builder),
      Scene.click(Scene.role('button', { name: 'Thought for 4s' })),
      Scene.expectOutMessage(message('Clicked')),
    )
  })

  it('says each step’s state and duration in words, its marker hidden', () => {
    const drawn = view({
      steps: [step('a', 'failed', { duration: 300 })],
      stateWords: { pending: 'waits', running: 'runs', done: 'did', failed: 'broke' },
    })
    const [item] = Inert.byTag(drawn, 'li')
    expect(Inert.text(item)).toBe('Step a broke 0.3s')
    const [marker] = Inert.children(Inert.children(item)[0])
    expect(Inert.value(marker, 'aria-hidden')).toBe('true')
  })

  it('names a step’s own list by its title', () => {
    const drawn = view({})
    const [, inner] = Inert.byTag(drawn, 'ol')
    expect(Inert.text(byId(drawn, Inert.value(inner, 'aria-labelledby')))).toBe('Step read')
  })

  it('shows every detail when steps do not toggle', () => {
    const drawn = view({})
    expect(Inert.byTag(drawn, 'button')).toHaveLength(1)
    expect(Inert.value(byId(drawn, 'trace-search-body'), 'inert')).toBeUndefined()
  })

  it('makes a step with detail a button that shows and hides it', () => {
    const toggling = { onToggleStep: () => message('Other'), openSteps: ['read'] }
    const drawn = view({ ...toggling, steps: [...trace, step('plain', 'done')] })
    // The trace's, then the two steps with detail; the plain one is no button.
    const [, search, read, ...rest] = Inert.byTag(drawn, 'button')
    expect(rest).toEqual([])
    expect(Inert.value(search, 'aria-expanded')).toBe('false')
    expect(Inert.value(byId(drawn, Inert.value(search, 'aria-controls')), 'inert')).toBe('')
    expect(Inert.value(read, 'aria-expanded')).toBe('true')
    expect(Inert.value(byId(drawn, 'trace-read-body'), 'inert')).toBeUndefined()
    sends<TestMessage>(
      builder => view({ ...toggling, open: Option.some(true) }, builder),
      Scene.click(Scene.role('button', { name: 'Step search done 1.5s' })),
      Scene.expectOutMessage(message('Other')),
    )
  })

  it('draws every element in a Slot', () => {
    const Drawn = SlotView.forMessages<TestMessage>().define(
      ThinkingStepsSlots,
      (_: undefined, __, builder) => view({ onToggleStep: () => message('Other') }, builder),
    )
    expect(Inert.unslotted(Inert.draw(Drawn, undefined), { inside: ['detail'] })).toEqual([])
  })
})

describe('ThinkingSteps recipe', () => {
  const css = Style.stylesheet(style)

  it('shimmers the words while running alone', () => {
    expect(css).toMatch(/\[data-state="running"\]\{[^}]*background-clip:text/)
  })

  it('turns a running marker for a travel’s time, held under reduced motion', () => {
    expect(css).toMatch(
      /\[data-state="running"\]:not\(:has\(> \*\)\)\{[^}]*animation:[^;}]*--fk-knob-travel/,
    )
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\{[^{]*\[data-state="running"\]:not\(:has\(> \*\)\)\{animation:none/,
    )
  })
})
