/**
 * Rendered conformance: scenarios over a widget mounted in a real browser,
 * each a function of a small harness that returns its findings as data. A
 * scenario reads what the page did (roles and names from Chromium's own
 * accessibility tree, state from attributes, focus from `document`); it never
 * reads a Model, a Slot or an obligation, so it holds a shipped widget and a
 * view assembled from primitives to the same behaviour. `Conformance.server`
 * is the half that reads server markup parsed back. Re-exported as
 * `Conformance` from `foldkit-mixins/testing`.
 *
 * "Rendered" is a claim about one page: these checks happened here. Whether
 * the declarations fit together is `A11y.check`'s (structural) and what the
 * author says is `provides` (declared).
 */

/** One node of Chromium's accessibility tree (`Accessibility.getFullAXTree`), reduced. */
export interface AxNode {
  readonly role: string
  readonly name: string
  /** The states Chromium reports, by name: `selected`, `checked`, `expanded`, `disabled`. */
  readonly states: Readonly<Record<string, string>>
}

export interface Harness {
  /** Where the widget is drawn. */
  readonly root: ParentNode
  /** Keys as `userEvent.keyboard` writes them: `{ArrowDown}`, `{Enter}`, ` `. */
  readonly press: (keys: string) => Promise<void>
  /** The accessibility tree as Chromium has it. Vitest's locators name elements their own way. */
  readonly accessibility: () => Promise<ReadonlyArray<AxNode>>
  /** A pointer press on an element that a disabled control must refuse. */
  readonly click: (element: Element) => Promise<void>
}

/** One thing a scenario looked at. */
export interface Check {
  readonly scenario: string
  readonly check: string
  readonly passed: boolean
  /** What was read, for a failure. */
  readonly detail: string
}

export type Result = ReadonlyArray<Check>

/** The checks that failed: a conforming widget gives `[]`. */
export const failures = (result: Result): Result => result.filter(check => !check.passed)

export type Direction = 'ltr' | 'rtl'
export type Orientation = 'vertical' | 'horizontal'

const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms))

/** Frames the page needs to answer a key: Foldkit draws on `requestAnimationFrame`. */
const frames = async (count = 3) => {
  for (let at = 0; at < count; at++)
    await new Promise<void>(done => requestAnimationFrame(() => done()))
}

/** Polls `read` until it holds, for up to two seconds; the last value either way. */
const eventually = async <A>(read: () => A, holds: (value: A) => boolean): Promise<A> => {
  let value = read()
  for (let at = 0; at < 100 && !holds(value); at++) {
    await sleep(20)
    value = read()
  }
  return value
}

/** Collects checks for one scenario. */
const recorder = (scenario: string) => {
  const checks: Array<Check> = []
  return {
    checks,
    note: (check: string, passed: boolean, detail: unknown) => {
      checks.push({ scenario, check, passed, detail: passed ? '' : String(detail) })
      return passed
    },
  }
}

const list = (root: ParentNode, selector: string): ReadonlyArray<HTMLElement> =>
  Array.from(root.querySelectorAll<HTMLElement>(selector))

/** An element's own words: `aria-label`, else its text without nested groups. */
const labelOf = (element: Element): string => {
  const given = element.getAttribute('aria-label')
  if (given !== null) return given
  const copy = element.cloneNode(true) as Element
  copy
    .querySelectorAll('[role="group"], [role="menu"], [role="tree"], ul, ol')
    .forEach(inner => inner.remove())
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Whether the page shows `element`: laid out and not hidden or inert. */
const shown = (element: Element): boolean => {
  const style = getComputedStyle(element)
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    element.closest('[inert], [hidden], [aria-hidden="true"]') === null
  )
}

const axOf = (nodes: ReadonlyArray<AxNode>, role: string) =>
  nodes.filter(node => node.role === role)

const names = (nodes: ReadonlyArray<AxNode>) => nodes.map(node => node.name)

const same = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((name, at) => name === right[at])

/** The key that moves forward in a line of items, by orientation and direction. */
const forwardKey = (orientation: Orientation, direction: Direction) =>
  orientation === 'vertical' ? 'ArrowDown' : direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
const backKey = (orientation: Orientation, direction: Direction) =>
  orientation === 'vertical' ? 'ArrowUp' : direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'

const key = (name: string) => (name === ' ' ? ' ' : `{${name}}`)

/** The item that has the keyboard: the active descendant of `container`, else the focused item. */
const currentIn = (
  container: Element | null,
  items: ReadonlyArray<HTMLElement>,
): HTMLElement | undefined => {
  const target = container?.getAttribute('aria-activedescendant') ?? null
  if (target !== null) return items.find(item => item.id === target)
  const focused = document.activeElement
  return items.find(item => item === focused)
}

// A listbox ------------------------------------------------------------------

export interface ListboxSpec {
  /** The listbox's accessible name. */
  readonly name: string
  /** The options' names, in order. */
  readonly options: ReadonlyArray<string>
  /** The name of one disabled option, if the widget draws one. */
  readonly disabled?: string
  readonly orientation?: Orientation
  readonly direction?: Direction
  /**
   * Gives the keyboard to the widget with its options drawn: a popup is
   * opened, a list is focused. Called first, and again whenever an activation
   * has closed the options.
   */
  readonly enter: () => Promise<void>
}

const OPTION = '[role="option"]'
const LISTBOX = '[role="listbox"]'

/**
 * A listbox: roles and names from the accessibility tree; the arrows (mirrored
 * under right to left when horizontal), Home and End move the keyboard over
 * the enabled options and never onto a disabled one; Enter and Space activate;
 * a disabled option is not activated by a press; `aria-selected` has a value on
 * every option after every step.
 */
export const listbox = async (harness: Harness, spec: ListboxSpec): Promise<Result> => {
  const { checks, note } = recorder('listbox')
  const orientation = spec.orientation ?? 'vertical'
  const direction = spec.direction ?? 'ltr'
  const container = () => harness.root.querySelector<HTMLElement>(LISTBOX)
  const options = () => list(harness.root, OPTION)
  const labelled = () => options().map(labelOf)
  const enabled = spec.options.filter(name => name !== spec.disabled)
  const current = () => {
    const item = currentIn(container(), options())
    return item === undefined ? undefined : labelOf(item)
  }
  const stateless = () =>
    options()
      .filter(option => !['true', 'false'].includes(option.getAttribute('aria-selected') ?? ''))
      .map(labelOf)
  const stateGaps = new Set<string>()
  const observe = () => stateless().forEach(label => stateGaps.add(label))
  const ensure = async () => {
    if (container() === null || options().length === 0) await spec.enter()
    await eventually(
      () => options().length,
      count => count > 0,
    )
    await frames()
  }
  const press = async (...keys: ReadonlyArray<string>) => {
    for (const each of keys) await harness.press(key(each))
    await frames()
    observe()
  }

  await ensure()
  const tree = await harness.accessibility()
  const boxes = axOf(tree, 'listbox')
  note(
    'one listbox with its name',
    same(names(boxes), [spec.name]),
    `listboxes ${JSON.stringify(names(boxes))}`,
  )
  note(
    'its options, in order, with their names',
    same(names(axOf(tree, 'option')), spec.options),
    `options ${JSON.stringify(names(axOf(tree, 'option')))}`,
  )
  observe()

  const first = enabled[0]
  const last = enabled[enabled.length - 1]
  const forward = forwardKey(orientation, direction)
  const back = backKey(orientation, direction)

  await press('Home')
  note('Home goes to the first enabled option', current() === first, `current ${current()}`)
  await press('End')
  note('End goes to the last enabled option', current() === last, `current ${current()}`)
  await press('Home')
  const visited = [current()]
  for (let at = 1; at < enabled.length; at++) {
    await press(forward)
    visited.push(current())
  }
  note(
    `${forward} walks the enabled options in order, skipping a disabled one`,
    same(visited.map(String), enabled),
    `visited ${JSON.stringify(visited)}`,
  )
  if (enabled.length > 1) {
    await press(back)
    note(`${back} goes back one`, current() === enabled[enabled.length - 2], `current ${current()}`)
  }
  if (orientation === 'horizontal') {
    // The mirrored pair moves the other way: if it did not, a right-to-left list reads backwards.
    await press('Home')
    const wrong = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    await press(wrong)
    note(
      `${wrong} does not advance ${direction === 'rtl' ? 'right to left' : 'left to right'}`,
      current() !== enabled[1] || enabled.length < 2,
      `current ${current()}`,
    )
  }

  // Activation: move onto the second enabled option, then activate it by each key.
  const target = enabled[1] ?? first
  for (const activate of ['Enter', ' '] as const) {
    await ensure()
    await press('Home')
    if (target !== first) await press(forward)
    await press(activate)
    await ensure()
    const selected = options()
      .filter(option => option.getAttribute('aria-selected') === 'true')
      .map(labelOf)
    note(
      `${activate === ' ' ? 'Space' : 'Enter'} activates the option the keyboard is on`,
      selected.includes(String(target)),
      `selected ${JSON.stringify(selected)}`,
    )
    observe()
  }

  if (spec.disabled !== undefined) {
    await ensure()
    const option = options().find(each => labelOf(each) === spec.disabled)
    if (option === undefined) {
      note('a disabled option is drawn', false, `labels ${JSON.stringify(labelled())}`)
    } else {
      const before = option.getAttribute('aria-selected')
      note(
        'a disabled option says so',
        option.getAttribute('aria-disabled') === 'true' || option.hasAttribute('disabled'),
        `aria-disabled ${option.getAttribute('aria-disabled')}`,
      )
      await harness.click(option)
      await frames()
      await ensure()
      const after = options().find(each => labelOf(each) === spec.disabled)
      note(
        'a press on a disabled option does not select it',
        after?.getAttribute('aria-selected') !== 'true' || before === 'true',
        `aria-selected ${after?.getAttribute('aria-selected')}`,
      )
    }
  }

  note(
    'aria-selected has a value on every option, after every step',
    stateGaps.size === 0,
    `no value on ${JSON.stringify([...stateGaps])}`,
  )
  return checks
}

// A checkbox -----------------------------------------------------------------

export interface CheckboxSpec {
  /** The checkbox's accessible name. */
  readonly name: string
  /** A disabled checkbox on the page, by name. */
  readonly disabled?: string
  /** Puts the keyboard on the checkbox named `name` (focus it). */
  readonly enter: () => Promise<void>
}

const CHECKBOX = '[role="checkbox"], input[type="checkbox"]'

const isChecked = (element: HTMLElement): boolean =>
  element.getAttribute('aria-checked') === 'true' ||
  (element instanceof HTMLInputElement && element.checked)

/**
 * A checkbox: its role and name from the accessibility tree; Space toggles it
 * and what it reports (`aria-checked`, or the native `checked`) follows, both
 * ways; a disabled one does not toggle.
 */
export const checkbox = async (harness: Harness, spec: CheckboxSpec): Promise<Result> => {
  const { checks, note } = recorder('checkbox')
  const tree = await harness.accessibility()
  const nodes = axOf(tree, 'checkbox')
  note(
    'it is a checkbox with its name',
    names(nodes).includes(spec.name),
    `checkboxes ${JSON.stringify(names(nodes))}`,
  )
  const elements = list(harness.root, CHECKBOX)
  const at = names(nodes).indexOf(spec.name)
  const target = elements[at]
  if (target === undefined || elements.length !== nodes.length) {
    note(
      'the page draws each checkbox once',
      false,
      `${elements.length} elements, ${nodes.length} in the tree`,
    )
    return checks
  }
  await spec.enter()
  await frames()
  const was = isChecked(target)
  await harness.press(key(' '))
  await frames()
  note('Space toggles it', isChecked(target) !== was, `checked ${was} then ${isChecked(target)}`)
  note(
    'what it reports follows',
    target.getAttribute('aria-checked') === null
      ? target instanceof HTMLInputElement
      : target.getAttribute('aria-checked') === String(isChecked(target)),
    `aria-checked ${target.getAttribute('aria-checked')}`,
  )
  await harness.press(key(' '))
  await frames()
  note('Space again toggles it back', isChecked(target) === was, `checked ${isChecked(target)}`)

  if (spec.disabled !== undefined) {
    const lockedAt = names(nodes).indexOf(spec.disabled)
    const locked = elements[lockedAt]
    if (locked === undefined) {
      note('a disabled checkbox is drawn', false, `checkboxes ${JSON.stringify(names(nodes))}`)
    } else {
      const before = isChecked(locked)
      note(
        'a disabled checkbox says so',
        nodes[lockedAt]?.states['disabled'] === 'true',
        `states ${JSON.stringify(nodes[lockedAt]?.states)}`,
      )
      locked.focus()
      await harness.press(key(' '))
      await harness.click(locked)
      await frames()
      note(
        'a disabled checkbox does not toggle',
        isChecked(locked) === before,
        `checked ${before} then ${isChecked(locked)}`,
      )
    }
  }
  return checks
}

// A tree ---------------------------------------------------------------------

export interface TreeSpec {
  /** The tree's accessible name. */
  readonly name: string
  /** A shut parent, by name, and one of its children. */
  readonly parent: string
  readonly child: string
  /** A row after the parent at the same level. */
  readonly next: string
  readonly direction?: Direction
  /** Gives the keyboard to the tree. */
  readonly enter: () => Promise<void>
}

const ITEM = '[role="treeitem"]'

/**
 * A tree: its role, name and rows from the accessibility tree; the arrow
 * toward the end opens a shut parent, then moves onto its first child; the one
 * toward the start goes back to the parent, then shuts it (both mirrored under
 * right to left); Down and Up move over the rows showing; Home and End reach
 * the ends; `aria-expanded` has a value on every parent.
 */
export const tree = async (harness: Harness, spec: TreeSpec): Promise<Result> => {
  const { checks, note } = recorder('tree')
  const direction = spec.direction ?? 'ltr'
  const toward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const away = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  const items = () => list(harness.root, ITEM).filter(shown)
  const row = (name: string) => list(harness.root, ITEM).find(each => labelOf(each) === name)
  const container = () => harness.root.querySelector<HTMLElement>('[role="tree"]')
  const current = () => {
    const item = currentIn(container(), list(harness.root, ITEM))
    return item === undefined ? undefined : labelOf(item)
  }
  const press = async (each: string) => {
    await harness.press(key(each))
    await frames()
  }
  const expanded = (name: string) => row(name)?.getAttribute('aria-expanded')

  const ax = await harness.accessibility()
  note(
    'one tree with its name',
    same(names(axOf(ax, 'tree')), [spec.name]),
    `trees ${JSON.stringify(names(axOf(ax, 'tree')))}`,
  )
  note(
    'the rows are tree items',
    names(axOf(ax, 'treeitem')).includes(spec.parent),
    `items ${JSON.stringify(names(axOf(ax, 'treeitem')))}`,
  )

  await spec.enter()
  await frames()
  await press('Home')
  note(
    'Home goes to the first row',
    current() === labelOf(items()[0] ?? document.body),
    `current ${current()}`,
  )
  const parent = row(spec.parent)
  if (parent === undefined) {
    note(
      'the parent is drawn',
      false,
      `rows ${JSON.stringify(list(harness.root, ITEM).map(labelOf))}`,
    )
    return checks
  }
  // Down from the first row until the parent has the keyboard.
  for (let at = 0; at < 20 && current() !== spec.parent; at++) await press('ArrowDown')
  note('ArrowDown reaches the parent', current() === spec.parent, `current ${current()}`)
  note(
    'a shut parent says so',
    expanded(spec.parent) === 'false',
    `aria-expanded ${expanded(spec.parent)}`,
  )
  note(
    'a shut parent shows no child',
    row(spec.child) === undefined || !shown(row(spec.child)!),
    'the child is showing',
  )
  await press(toward)
  note(
    `${toward} opens it`,
    expanded(spec.parent) === 'true',
    `aria-expanded ${expanded(spec.parent)}`,
  )
  const child = row(spec.child)
  note('and its child shows', child !== undefined && shown(child), 'the child is not showing')
  await press(toward)
  note(
    `${toward} again moves onto its first child`,
    current() !== spec.parent && current() !== undefined,
    `current ${current()}`,
  )
  await press(away)
  note(`${away} goes back to the parent`, current() === spec.parent, `current ${current()}`)
  await press(away)
  note(
    `${away} on an open parent shuts it`,
    expanded(spec.parent) === 'false',
    `aria-expanded ${expanded(spec.parent)}`,
  )
  await press('ArrowDown')
  note('ArrowDown steps past a shut parent', current() === spec.next, `current ${current()}`)
  await press('ArrowUp')
  note('ArrowUp comes back', current() === spec.parent, `current ${current()}`)
  await press('End')
  const showing = items()
  note(
    'End goes to the last row showing',
    current() === labelOf(showing[showing.length - 1] ?? document.body),
    `current ${current()}`,
  )
  const gaps = list(harness.root, ITEM).filter(
    each =>
      each.querySelector('[role="group"]') !== null && each.getAttribute('aria-expanded') === null,
  )
  note(
    'aria-expanded has a value on every parent',
    gaps.length === 0,
    `no value on ${JSON.stringify(gaps.map(labelOf))}`,
  )
  return checks
}

// A dialog -------------------------------------------------------------------

export interface DialogSpec {
  /** The dialog's accessible name. */
  readonly name: string
  /** Opens it, from `trigger`. */
  readonly open: () => Promise<void>
  /** What had the keyboard before it opened, and should again after. */
  readonly trigger: () => HTMLElement | null
  /** A dialog opened from inside this one. */
  readonly nested?: {
    readonly name: string
    readonly open: () => Promise<void>
    /** The control inside the outer dialog that opened it. */
    readonly trigger: () => HTMLElement | null
  }
}

const DIALOG = 'dialog, [role="dialog"], [role="alertdialog"]'

const nameOf = (element: Element): string => {
  const given = element.getAttribute('aria-label')
  if (given !== null) return given
  const by = element.getAttribute('aria-labelledby')
  return by === null
    ? ''
    : by
        .split(/\s+/)
        .map(id => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim()
}

const openDialog = (root: ParentNode, name: string): HTMLElement | undefined =>
  list(root, DIALOG).find(
    each =>
      nameOf(each) === name && (!(each instanceof HTMLDialogElement) || each.open) && shown(each),
  )

/**
 * A dialog: its role and name from the accessibility tree; focus moves in when
 * it opens and Tab never leaves it; Escape closes it and gives focus back to
 * what had it; opened over another dialog, Escape closes only the inner one,
 * focus returns into the outer, and a second Escape closes the outer.
 */
export const dialog = async (harness: Harness, spec: DialogSpec): Promise<Result> => {
  const { checks, note } = recorder('dialog')
  const inside = (element: Element | null, name: string) => {
    const found = openDialog(harness.root, name)
    return found !== undefined && element !== null && found.contains(element)
  }
  const opener = spec.trigger()
  opener?.focus()
  await spec.open()
  await eventually(
    () => openDialog(harness.root, spec.name),
    found => found !== undefined,
  )
  await frames()
  const ax = await harness.accessibility()
  note(
    'it is a dialog with its name',
    names(axOf(ax, 'dialog')).includes(spec.name) ||
      names(axOf(ax, 'alertdialog')).includes(spec.name),
    `dialogs ${JSON.stringify(names(axOf(ax, 'dialog')))}`,
  )
  note(
    'focus moves in when it opens',
    inside(document.activeElement, spec.name),
    `active ${document.activeElement?.tagName}`,
  )
  const stops =
    list(harness.root, 'button, a[href], input, select, textarea, [tabindex]').length + 2
  let escaped = false
  for (let at = 0; at < stops && !escaped; at++) {
    await harness.press('{Tab}')
    if (!inside(document.activeElement, spec.name)) escaped = true
  }
  note('Tab never leaves it', !escaped, `focus left to ${document.activeElement?.tagName}`)
  escaped = false
  for (let at = 0; at < stops && !escaped; at++) {
    await harness.press('{Shift>}{Tab}{/Shift}')
    if (!inside(document.activeElement, spec.name)) escaped = true
  }
  note('Shift+Tab never leaves it', !escaped, `focus left to ${document.activeElement?.tagName}`)

  if (spec.nested !== undefined) {
    const { nested } = spec
    // Back on the control that opens the inner dialog, as a user's Tab or pointer would put it.
    nested.trigger()?.focus()
    await nested.open()
    await eventually(
      () => openDialog(harness.root, nested.name),
      found => found !== undefined,
    )
    await frames()
    note(
      'the inner dialog takes the keyboard',
      inside(document.activeElement, nested.name),
      `active ${document.activeElement?.tagName}`,
    )
    await harness.press('{Escape}')
    await frames(5)
    note(
      'Escape closes the inner dialog only',
      openDialog(harness.root, nested.name) === undefined &&
        openDialog(harness.root, spec.name) !== undefined,
      `inner ${openDialog(harness.root, nested.name) === undefined ? 'shut' : 'open'}, outer ${openDialog(harness.root, spec.name) === undefined ? 'shut' : 'open'}`,
    )
    note(
      'focus returns into the outer dialog',
      inside(document.activeElement, spec.name),
      `active ${document.activeElement?.tagName}`,
    )
    note(
      'to the control that opened the inner one',
      document.activeElement === nested.trigger(),
      `active ${document.activeElement?.tagName}`,
    )
  }

  await harness.press('{Escape}')
  await frames(5)
  note('Escape closes it', openDialog(harness.root, spec.name) === undefined, 'it is still open')
  note(
    'focus returns to what had it',
    opener !== null && document.activeElement === opener,
    `active ${document.activeElement?.tagName}`,
  )
  return checks
}

// Tabs -----------------------------------------------------------------------

export interface TabsSpec {
  /** The tab list's accessible name. */
  readonly name: string
  /** The tabs' names, in order. */
  readonly tabs: ReadonlyArray<string>
  /** A disabled tab, by name. */
  readonly disabled?: string
  readonly direction?: Direction
  /** `'manual'`: the arrows move the keyboard and Enter or Space chooses. Default `'automatic'`. */
  readonly activation?: 'automatic' | 'manual'
  /** Gives the keyboard to the tabs. */
  readonly enter: () => Promise<void>
}

const TAB = '[role="tab"]'

/**
 * Tabs: the tab list, tabs and the one panel from the accessibility tree, the
 * panel named by its tab; exactly one tab selected, its `aria-controls` the
 * panel; the arrows (mirrored under right to left) move over the enabled tabs
 * and never onto a disabled one, Home and End reach the ends; `aria-selected`
 * has a value on every tab after every step.
 */
export const tabs = async (harness: Harness, spec: TabsSpec): Promise<Result> => {
  const { checks, note } = recorder('tabs')
  const direction = spec.direction ?? 'ltr'
  const manual = spec.activation === 'manual'
  const items = () => list(harness.root, TAB)
  const selected = () =>
    items()
      .filter(item => item.getAttribute('aria-selected') === 'true')
      .map(labelOf)
  const current = () => {
    const item = currentIn(null, items())
    return item === undefined ? undefined : labelOf(item)
  }
  const enabled = spec.tabs.filter(name => name !== spec.disabled)
  const gaps = new Set<string>()
  const observe = () =>
    items()
      .filter(item => !['true', 'false'].includes(item.getAttribute('aria-selected') ?? ''))
      .forEach(item => gaps.add(labelOf(item)))
  const press = async (each: string) => {
    await harness.press(key(each))
    await frames()
    observe()
  }

  const ax = await harness.accessibility()
  note(
    'one tab list with its name',
    same(names(axOf(ax, 'tablist')), [spec.name]),
    `tab lists ${JSON.stringify(names(axOf(ax, 'tablist')))}`,
  )
  note(
    'its tabs, in order, with their names',
    same(names(axOf(ax, 'tab')), spec.tabs),
    `tabs ${JSON.stringify(names(axOf(ax, 'tab')))}`,
  )
  observe()
  note(
    'exactly one tab is selected',
    selected().length === 1,
    `selected ${JSON.stringify(selected())}`,
  )
  const chosen = items().find(item => item.getAttribute('aria-selected') === 'true')
  const controlled = chosen?.getAttribute('aria-controls') ?? null
  const panel = controlled === null ? null : document.getElementById(controlled)
  note(
    'the selected tab controls a tab panel',
    panel?.getAttribute('role') === 'tabpanel',
    `aria-controls ${controlled}`,
  )
  note(
    'named by the tab',
    panel !== null && chosen !== undefined && nameOf(panel) === labelOf(chosen),
    `name ${panel === null ? '' : nameOf(panel)}`,
  )
  const visiblePanels = list(harness.root, '[role="tabpanel"]').filter(shown)
  note('one panel shows', visiblePanels.length === 1, `${visiblePanels.length} panels`)

  await spec.enter()
  await frames()
  const forward = forwardKey('horizontal', direction)
  const back = backKey('horizontal', direction)
  await press('Home')
  note('Home goes to the first enabled tab', current() === enabled[0], `current ${current()}`)
  await press('End')
  note(
    'End goes to the last enabled tab',
    current() === enabled[enabled.length - 1],
    `current ${current()}`,
  )
  await press('Home')
  const visited = [current()]
  for (let at = 1; at < enabled.length; at++) {
    await press(forward)
    visited.push(current())
  }
  note(
    `${forward} walks the enabled tabs in order, skipping a disabled one`,
    same(visited.map(String), enabled),
    `visited ${JSON.stringify(visited)}`,
  )
  await press(back)
  note(`${back} goes back one`, current() === enabled[enabled.length - 2], `current ${current()}`)
  if (manual) {
    note(
      'the arrows do not choose a tab',
      selected()[0] === spec.tabs.find(name => name === selected()[0]) &&
        selected()[0] !== current(),
      `selected ${JSON.stringify(selected())}`,
    )
    await press('Enter')
  }
  note(
    'the tab the keyboard is on is the selected one',
    same(selected(), [String(current())]),
    `selected ${JSON.stringify(selected())}, current ${current()}`,
  )
  note(
    'aria-selected has a value on every tab, after every step',
    gaps.size === 0,
    `no value on ${JSON.stringify([...gaps])}`,
  )
  return checks
}

// Server markup ----------------------------------------------------------------

/** What server markup, parsed back, must hold: roles, names and the state attributes each carries. */
export interface Expect {
  readonly role: string
  readonly name: string
  /** Attributes that must hold, by name; the value `true` means present with any value. */
  readonly attributes?: Readonly<Record<string, string | true>>
}

const roleOf = (element: Element): string =>
  element.getAttribute('role') ??
  (element instanceof HTMLInputElement && element.type === 'checkbox'
    ? 'checkbox'
    : element.localName === 'dialog'
      ? 'dialog'
      : '')

/**
 * The server half: a widget rendered to a string and parsed back holds each
 * expected role with its name and attributes, so a page served before it
 * hydrates already conforms. `scenario` only labels the findings.
 */
export const server = (
  scenario: string,
  root: ParentNode,
  expected: ReadonlyArray<Expect>,
): Result => {
  const { checks, note } = recorder(`${scenario} (server)`)
  for (const { role, name, attributes } of expected) {
    const found = Array.from(root.querySelectorAll('*')).filter(
      each => roleOf(each) === role && (nameOf(each) === name || labelOf(each) === name),
    )
    note(`${role} "${name}" is in the markup`, found.length === 1, `${found.length} found`)
    const element = found[0]
    if (element === undefined) continue
    for (const [attribute, want] of Object.entries(attributes ?? {})) {
      const got = element.getAttribute(attribute)
      note(
        `${role} "${name}" has ${attribute}${want === true ? '' : `="${want}"`}`,
        want === true ? got !== null : got === want,
        `${attribute}=${got}`,
      )
    }
  }
  return checks
}
