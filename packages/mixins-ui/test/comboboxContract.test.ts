// @vitest-environment jsdom
/**
 * Phase G of docs/design/behaviors-DESIGN.md: the Combobox keyboard contract
 * as Scene tests against `@foldkit/ui/combobox`, one per row. A failing row
 * is a note for upstream, not a fork: the rows below that `@foldkit/ui`
 * does not meet are written as what it does today and marked `upstream`,
 * so a later version that meets the contract fails here and gets the row
 * turned around.
 */
import { describe, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import * as Combobox from '@foldkit/ui/combobox'

const fruits = ['apple', 'banana', 'cherry'] as const
type Fruit = (typeof fruits)[number]

const combobox = Combobox.create<Fruit>()
const id = 'c'
const input = `#${id}-input`
const item = (index: number) => `#${id}-item-${index}`

const model = (overrides: Partial<Combobox.Model> = {}): Combobox.Model => ({
  ...Combobox.init({ id }),
  ...overrides,
})

const open = (index: Option.Option<number> = Option.none()) =>
  model({ isOpen: true, maybeActiveItemIndex: index, activationTrigger: 'Keyboard' })

const scene = (
  initial: Combobox.Model,
  ...steps: Parameters<
    typeof Scene.scene<Combobox.Model, Combobox.Message, Combobox.OutMessage<Fruit>>
  >[1][]
) =>
  Scene.scene<Combobox.Model, Combobox.Message, Combobox.OutMessage<Fruit>>(
    {
      update: combobox.update,
      view: (model, h) =>
        combobox.view(
          model,
          {
            items: fruits,
            restingInputValue: '',
            maybeSelectedValue: Option.none(),
            itemToConfig: item => ({ content: h.span([], [item]) }),
            itemToValue: item => item,
            itemToDisplayText: item => item,
          },
          h,
        ),
    },
    Scene.given(initial),
    ...steps,
  )

const expectExpanded = (expanded: boolean) =>
  Scene.expect(Scene.selector(input)).toHaveAttr('aria-expanded', String(expanded))
const expectActive = (index: number) =>
  Scene.expect(Scene.selector(input)).toHaveAttr('aria-activedescendant', `${id}-item-${index}`)
const expectNoActive = () =>
  Scene.expect(Scene.selector(`${input}[aria-activedescendant]`)).toBeAbsent()
/** The anchor and backdrop Mounts appear with the panel; a step that opens the panel resolves them. */
const anchored = () =>
  Scene.Mount.resolveAll(
    [Combobox.AnchorCombobox, Combobox.Message.CompletedAnchorCombobox()],
    [Combobox.PortalComboboxBackdrop, Combobox.Message.CompletedPortalComboboxBackdrop()],
  )
const panelEnded = () =>
  Scene.Mount.expectEnded(Combobox.AnchorCombobox, Combobox.PortalComboboxBackdrop)
const scrolled = () =>
  Scene.Command.resolve(Combobox.ScrollIntoView, Combobox.Message.CompletedScrollIntoView())
const focused = () =>
  Scene.Command.resolve(Combobox.FocusInput, Combobox.Message.CompletedFocusInput())

describe('Combobox keyboard contract (@foldkit/ui/combobox)', () => {
  it('ArrowDown when closed opens and highlights the first item', () => {
    scene(
      model(),
      Scene.keydown(input, 'ArrowDown'),
      Scene.expectHandled(),
      anchored(),
      expectExpanded(true),
      expectActive(0),
    )
  })

  it('ArrowDown when open moves to the next item', () => {
    scene(
      open(Option.some(0)),
      anchored(),
      Scene.keydown(input, 'ArrowDown'),
      scrolled(),
      expectActive(1),
    )
  })

  it('upstream: ArrowDown on the last item wraps to the first (the contract says no wrap)', () => {
    scene(
      open(Option.some(2)),
      anchored(),
      Scene.keydown(input, 'ArrowDown'),
      scrolled(),
      expectActive(0),
    )
  })

  it('ArrowUp when closed opens and highlights the last item', () => {
    scene(
      model(),
      Scene.keydown(input, 'ArrowUp'),
      anchored(),
      expectExpanded(true),
      expectActive(2),
    )
  })

  it('upstream: Alt+ArrowDown opens with the first item highlighted (the contract says no highlight)', () => {
    scene(
      model(),
      Scene.keydown(input, 'ArrowDown', { altKey: true }),
      anchored(),
      expectExpanded(true),
      expectActive(0),
    )
  })

  it('upstream: Alt+ArrowUp when open moves the highlight (the contract says it closes)', () => {
    scene(
      open(Option.some(1)),
      anchored(),
      Scene.keydown(input, 'ArrowUp', { altKey: true }),
      scrolled(),
      expectExpanded(true),
      expectActive(0),
    )
  })

  it('upstream: Home and End when open move the highlight (the contract says they move the caret)', () => {
    scene(
      open(Option.some(1)),
      anchored(),
      Scene.keydown(input, 'End'),
      scrolled(),
      expectActive(2),
      Scene.keydown(input, 'Home'),
      scrolled(),
      expectActive(0),
    )
  })

  it('Home and End when closed fall through to the caret', () => {
    scene(
      model(),
      Scene.keydown(input, 'Home'),
      Scene.expectIgnored(),
      Scene.keydown(input, 'End'),
      Scene.expectIgnored(),
      expectExpanded(false),
    )
  })

  it('Ctrl+Home and Ctrl+End when open highlight the first and last items', () => {
    scene(
      open(Option.some(1)),
      anchored(),
      Scene.keydown(input, 'End', { ctrlKey: true }),
      scrolled(),
      expectActive(2),
      Scene.keydown(input, 'Home', { ctrlKey: true }),
      scrolled(),
      expectActive(0),
    )
  })

  it('upstream: PageUp and PageDown are ignored (the contract says they move by ten)', () => {
    scene(
      open(Option.some(1)),
      anchored(),
      Scene.keydown(input, 'PageDown'),
      Scene.expectIgnored(),
      Scene.keydown(input, 'PageUp'),
      Scene.expectIgnored(),
      expectActive(1),
    )
  })

  it('Enter selects the highlighted item and closes', () => {
    scene(
      open(Option.some(1)),
      anchored(),
      Scene.keydown(input, 'Enter'),
      Scene.Command.resolve(Combobox.ClickItem, Combobox.Message.CompletedClickItem()),
      Scene.click(item(1)),
      Scene.expectOutMessage<Combobox.OutMessage<Fruit>>({ _tag: 'Selected', value: 'banana' }),
      focused(),
      panelEnded(),
      expectExpanded(false),
      Scene.expect(Scene.selector(input)).toHaveValue('banana'),
    )
  })

  it('Enter when closed falls through to the form', () => {
    scene(model(), Scene.keydown(input, 'Enter'), Scene.expectIgnored())
  })

  it('upstream: Escape with a highlight closes at once (the contract says it first clears the highlight)', () => {
    scene(
      open(Option.some(1)),
      anchored(),
      Scene.keydown(input, 'Escape'),
      focused(),
      panelEnded(),
      expectExpanded(false),
    )
  })

  it('Escape when closed falls through', () => {
    scene(model(), Scene.keydown(input, 'Escape'), Scene.expectIgnored())
  })

  it('Tab does not commit in list mode', () => {
    scene(
      open(Option.some(1)),
      anchored(),
      Scene.keydown(input, 'Tab'),
      Scene.expectIgnored(),
      Scene.expectNoOutMessage(),
    )
  })

  it('upstream: typing and Backspace both highlight the first item (the contract says typing opens with no highlight)', () => {
    scene(
      model(),
      Scene.type(input, 'ba'),
      anchored(),
      expectExpanded(true),
      expectActive(0),
      Scene.type(input, 'b'),
      expectExpanded(true),
      expectActive(0),
    )
  })

  it('blur closes without moving focus (pointer-over-content is the PreventBlur Mount, outside a Scene)', () => {
    scene(open(Option.some(1)), anchored(), Scene.blur(input), panelEnded(), expectExpanded(false))
  })
})
