/**
 * A rendered conformance suite: what the WAI-ARIA Authoring Practices ask of a
 * pattern, run against a widget mounted on the real runtime in Chromium. The
 * catalog gate (`patterns.ts`) proves who is named as the provider of a
 * pattern's keys, focus and activation; this proves the provider works.
 *
 * A widget joins by supplying an `Adapter`: how to mount it (told where focus
 * starts, the reading direction and anything the pattern varies), where its
 * parts are (found by role, never by class), and a projection of the state a
 * key can change. The scenarios come from the pattern's table here
 * (`listScenarios`, `treeScenarios`), not from the widget.
 *
 * Every scenario names the focus and the state it expects afterwards. A
 * scenario that expects focus to move fails when it does not (so a key that
 * does nothing, as a no-op right-to-left swap would, cannot pass), and one
 * that expects focus to stay still waits for the frames that a late move
 * would take.
 */
import { expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'

export type Orientation = 'horizontal' | 'vertical'
export type Direction = 'ltr' | 'rtl'

/** A mounted widget: its parts by role, and the state a key can change. */
export interface Mounted {
  dispose(): void
  /** Every item shown, disabled ones too, in reading order. */
  items(): ReadonlyArray<HTMLElement>
  /** The item with focus, or the one `aria-activedescendant` names. */
  current(): HTMLElement | undefined
  /** An item's words, as a user reads them. */
  labelOf(item: HTMLElement): string
  /** What a key can change, as strings: the chosen value, open branches, a checked set. */
  state(): Readonly<Record<string, string>>
  /** The element holding the role the pattern is named for (listbox, tree, tablist, dialog). */
  root(): HTMLElement
  /** A button drawn before the widget, to Tab from. */
  entry?: (() => HTMLElement) | undefined
}

export interface Adapter<Setup> {
  /** `<Widget>` in each scenario's name. */
  readonly name: string
  mount(setup: Setup): Promise<Mounted>
}

export interface Scenario<Setup> {
  readonly name: string
  readonly setup: Setup
  /** The item holding focus when the keys start, by its label; none when the scenario starts elsewhere. */
  readonly start?: string | undefined
  /** Pressed in order, each as `Key` or `Modifier+Key`. */
  readonly keys: ReadonlyArray<string>
  /** The item expected to hold focus afterwards, by its label. */
  readonly focus: string
  /** Entries of `state()` expected afterwards. */
  readonly state?: Readonly<Record<string, string>> | undefined
  /** Every key must have been defaultPrevented: the page must not also scroll. */
  readonly prevented?: boolean | undefined
  /** Why it fails today, as a finding; the scenario then runs as `test.fails`. */
  readonly finding?: string | undefined
}

const SPECIAL = new Set(['{', '[', '>', '/'])

/** Presses `Shift+Tab`, `ArrowDown`, `a` or ` `, and reports whether the page's handlers prevented the default. */
export const press = async (chord: string): Promise<boolean> => {
  const parts = chord.length > 1 && chord.includes('+') ? chord.split('+') : [chord]
  const key = parts.at(-1)!
  const mods = parts.slice(0, -1)
  let prevented = false
  const listen = (event: KeyboardEvent) => {
    prevented = event.defaultPrevented
  }
  window.addEventListener('keydown', listen)
  try {
    const named = key.length === 1 && !SPECIAL.has(key) ? key : `{${key}}`
    const down = mods.map(mod => `{${mod}>}`).join('')
    const up = [...mods]
      .reverse()
      .map(mod => `{/${mod}}`)
      .join('')
    await userEvent.keyboard(`${down}${named}${up}`)
  } finally {
    window.removeEventListener('keydown', listen)
  }
  return prevented
}

/** Frames enough for a late move to show: a negative assertion needs a settle, not a sleep. */
export const settle = async (frames = 3) => {
  for (let frame = 0; frame < frames; frame++)
    await new Promise(done => requestAnimationFrame(done))
}

/** Next and previous in the reading axis of a list, mirrored right to left where it is horizontal. */
export const arrows = (orientation: Orientation, direction: Direction) =>
  orientation === 'vertical'
    ? { next: 'ArrowDown', previous: 'ArrowUp' }
    : direction === 'rtl'
      ? { next: 'ArrowLeft', previous: 'ArrowRight' }
      : { next: 'ArrowRight', previous: 'ArrowLeft' }

// ---------------------------------------------------------------------------
// Scenario tables
// ---------------------------------------------------------------------------

/** A flat list of items under one of the APG's list patterns. */
export interface ListSpec<Setup> {
  readonly pattern: 'listbox' | 'tabs'
  /** Every item's label, in order. */
  readonly labels: ReadonlyArray<string>
  readonly disabled: ReadonlyArray<string>
  readonly orientation: Orientation
  /** Whether arrowing past the end wraps; the APG makes it optional, so the adapter declares what it does. */
  readonly wraps: boolean
  /** Whether PageUp and PageDown are held, as the APG's tabs do. */
  readonly pages: boolean
  /** Whether a printed character goes to the next item starting with it, as a listbox's does and tabs' does not. */
  readonly typeahead: boolean
  /** `follows` for automatic tabs: the chosen value is the focused one. `explicit` otherwise. */
  readonly selection: 'follows' | 'explicit'
  readonly setup: (start: string, direction: Direction) => Setup
  /** Findings, by the scenario's name, to run as `test.fails`. */
  readonly findings?: Readonly<Record<string, string>> | undefined
}

/** The keys of a list pattern, in one direction. */
export const listScenarios = <Setup>(
  spec: ListSpec<Setup>,
  direction: Direction,
): ReadonlyArray<Scenario<Setup>> => {
  const enabled = spec.labels.filter(label => !spec.disabled.includes(label))
  const first = enabled[0]!
  const last = enabled.at(-1)!
  const keys = arrows(spec.orientation, direction)
  const cross =
    spec.orientation === 'vertical' ? arrows('horizontal', 'ltr') : arrows('vertical', 'ltr')
  const tag = direction === 'rtl' ? ' (right to left)' : ''
  const made: Array<Scenario<Setup>> = []
  // What is chosen after a move: the value the scenario started with, unless choosing follows focus.
  const chosen = (start: string, to: string) => ({
    selected: spec.selection === 'follows' ? to : start,
  })
  const add = (
    name: string,
    start: string,
    pressed: ReadonlyArray<string>,
    focus: string,
    options: { readonly prevented?: boolean; readonly chosen?: boolean } = {},
  ) => {
    const full = `${name}${tag}`
    made.push({
      name: full,
      setup: spec.setup(start, direction),
      start,
      keys: pressed,
      focus,
      state: options.chosen === false ? undefined : chosen(start, focus),
      prevented: options.prevented,
      finding: spec.findings?.[full],
    })
  }
  const move = (name: string, start: string, key: string, to: string) =>
    add(name, start, [key], to, { prevented: true })

  move(`${keys.next} goes to the next enabled item`, first, keys.next, enabled[1]!)
  move(`${keys.previous} goes to the previous enabled item`, enabled[1]!, keys.previous, first)
  // An arrow passes a disabled item rather than stopping on it.
  const skipped = enabled.find(label =>
    spec.disabled.includes(spec.labels[spec.labels.indexOf(label) + 1] ?? ''),
  )
  if (skipped !== undefined) {
    const after = enabled[enabled.indexOf(skipped) + 1]
    if (after !== undefined) move(`${keys.next} passes a disabled item`, skipped, keys.next, after)
    if (enabled.indexOf(skipped) + 1 < enabled.length)
      move(`${keys.previous} passes a disabled item`, after!, keys.previous, skipped)
  }
  move('Home goes to the first enabled item', last, 'Home', first)
  move('End goes to the last enabled item', first, 'End', last)
  if (spec.pages) {
    move('PageDown goes to the last enabled item', first, 'PageDown', last)
    move('PageUp goes to the first enabled item', last, 'PageUp', first)
  }
  add(
    `${keys.next} past the last item ${spec.wraps ? 'wraps to the first' : 'stays'}`,
    last,
    [keys.next],
    spec.wraps ? first : last,
    { prevented: true },
  )
  add(
    `${keys.previous} before the first item ${spec.wraps ? 'wraps to the last' : 'stays'}`,
    first,
    [keys.previous],
    spec.wraps ? last : first,
    { prevented: true },
  )
  // The arrows across the axis are not the pattern's.
  add(`${cross.next} across the axis moves nothing`, first, [cross.next], first)

  // Typeahead, from the labels: a letter lands on the next enabled item that starts with it.
  const initials = (label: string) => label[0]!.toLowerCase()
  for (const label of spec.typeahead ? enabled : []) {
    if (label === first) continue
    const alike = enabled.filter(other => initials(other) === initials(label))
    if (alike.length === 1) {
      add(`typing "${label[0]}" goes to ${label}`, first, [label[0]!.toLowerCase()], label)
    } else if (alike[0] !== label || alike.indexOf(label) > 0) {
      // Two letters, typed together, tell apart items that share an initial.
      const prefix = label.slice(0, 2).toLowerCase()
      const sharing = enabled.filter(other => other.toLowerCase().startsWith(prefix))
      if (sharing.length === 1 && label.length > 1)
        add(`typing "${label.slice(0, 2)}" goes to ${label}`, first, [...prefix], label)
    }
  }
  const barred = spec.disabled.find(label =>
    enabled.every(other => initials(other) !== initials(label)),
  )
  if (barred !== undefined && spec.typeahead)
    add(`typing "${barred[0]}" never lands on the disabled ${barred}`, first, [barred[0]!], first)
  return made
}

/** A node of a tree under test; the same shape the widget's own nodes have. */
export interface TreeNodeSpec {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly children?: ReadonlyArray<TreeNodeSpec>
}

export interface TreeSetup {
  readonly direction: Direction
  /** Labels of the rows open when the scenario starts. */
  readonly open: ReadonlyArray<string>
  /** The row holding focus when it starts. */
  readonly start: string
  readonly checkable: boolean
}

export interface TreeSpec<Setup> {
  readonly nodes: ReadonlyArray<TreeNodeSpec>
  readonly setup: (setup: TreeSetup) => Setup
  /** Whether Enter on a row that holds rows also opens it, as the widget documents. */
  readonly enterToggles: boolean
  readonly findings?: Readonly<Record<string, string>> | undefined
}

interface Flat {
  readonly label: string
  readonly parent: string | undefined
  readonly branch: boolean
  readonly disabled: boolean
  readonly depth: number
  readonly leaves: ReadonlyArray<string>
}

const flatten = (nodes: ReadonlyArray<TreeNodeSpec>): ReadonlyArray<Flat> => {
  const out: Array<Flat> = []
  const walk = (
    level: ReadonlyArray<TreeNodeSpec>,
    parent: string | undefined,
    depth: number,
  ): ReadonlyArray<string> =>
    level.flatMap(node => {
      const at = out.length
      out.push({
        label: node.label,
        parent,
        branch: (node.children?.length ?? 0) > 0,
        disabled: node.disabled === true,
        depth,
        leaves: [],
      })
      const under =
        node.children === undefined || node.children.length === 0
          ? [node.label]
          : walk(node.children, node.label, depth + 1)
      out[at] = { ...out[at]!, leaves: under }
      return under
    })
  walk(nodes, undefined, 1)
  return out
}

/** The keys of the APG's tree view, in one direction. */
export const treeScenarios = <Setup>(
  spec: TreeSpec<Setup>,
  direction: Direction,
  checkable: boolean,
): ReadonlyArray<Scenario<Setup>> => {
  const rows = flatten(spec.nodes)
  const by = new Map(rows.map(row => [row.label, row]))
  const tag = `${direction === 'rtl' ? ' (right to left)' : ''}${checkable ? ' (checkable)' : ''}`
  const open = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const close = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  const made: Array<Scenario<Setup>> = []
  const shownWith = (opened: ReadonlyArray<string>) =>
    rows.filter(row => {
      for (let at = row.parent; at !== undefined; at = by.get(at)!.parent)
        if (!opened.includes(at)) return false
      return true
    })
  const add = (
    name: string,
    opened: ReadonlyArray<string>,
    start: string,
    keys: ReadonlyArray<string>,
    focus: string,
    options: {
      readonly state?: Readonly<Record<string, string>>
      readonly prevented?: boolean
    } = {},
  ) => {
    const full = `${name}${tag}`
    made.push({
      name: full,
      setup: spec.setup({ direction, open: opened, start, checkable }),
      start,
      keys,
      focus,
      state: options.state,
      prevented: options.prevented,
      finding: spec.findings?.[full],
    })
  }
  const branches = rows.filter(row => row.branch && !row.disabled)
  const topBranch = branches.find(row => row.depth === 1)!
  const everyBranch = rows.filter(row => row.branch).map(row => row.label)
  const shown = shownWith(everyBranch).filter(row => !row.disabled)
  const first = shown[0]!
  const last = shown.at(-1)!
  const openList = (labels: ReadonlyArray<string>) => [...labels].sort().join(',')

  // Down and Up, over the rows showing, past a disabled one.
  add(
    'ArrowDown goes to the next row showing',
    everyBranch,
    first.label,
    ['ArrowDown'],
    shown[1]!.label,
    { prevented: true },
  )
  add(
    'ArrowUp goes to the previous row showing',
    everyBranch,
    shown[1]!.label,
    ['ArrowUp'],
    first.label,
    { prevented: true },
  )
  add('Home goes to the first row', everyBranch, last.label, ['Home'], first.label, {
    prevented: true,
  })
  add('End goes to the last row showing', everyBranch, first.label, ['End'], last.label, {
    prevented: true,
  })
  const closedTop = shownWith([]).filter(row => !row.disabled)
  const beforeDisabled = shownWith([]).find((row, at, all) => all[at + 1]?.disabled === true)
  const afterDisabled =
    beforeDisabled === undefined
      ? undefined
      : shownWith([])[shownWith([]).indexOf(beforeDisabled) + 2]
  if (beforeDisabled !== undefined && afterDisabled !== undefined) {
    add(
      'ArrowDown passes a disabled row',
      [],
      beforeDisabled.label,
      ['ArrowDown'],
      afterDisabled.label,
      { prevented: true },
    )
    add(
      'ArrowUp passes a disabled row',
      [],
      afterDisabled.label,
      ['ArrowUp'],
      beforeDisabled.label,
      { prevented: true },
    )
  }
  add(
    'ArrowDown on the last row stays',
    [],
    closedTop.at(-1)!.label,
    ['ArrowDown'],
    closedTop.at(-1)!.label,
  )

  // The inline axis: opening, stepping in, shutting, stepping out.
  const withChildren = topBranch
  const firstChild = rows.find(row => row.parent === withChildren.label)!
  add(
    `${open} opens a shut row and keeps focus on it`,
    [],
    withChildren.label,
    [open],
    withChildren.label,
    {
      prevented: true,
      state: { open: openList([withChildren.label]) },
    },
  )
  add(
    `${open} on an open row steps into its first row`,
    [withChildren.label],
    withChildren.label,
    [open],
    firstChild.label,
    { prevented: true },
  )
  add(
    `${close} on an open row shuts it and keeps focus on it`,
    [withChildren.label],
    withChildren.label,
    [close],
    withChildren.label,
    {
      prevented: true,
      state: { open: '' },
    },
  )
  add(
    `${close} on a row inside steps out to its parent`,
    [withChildren.label],
    firstChild.label,
    [close],
    withChildren.label,
    { prevented: true },
  )
  const leaf = rows.find(row => !row.branch && row.parent === undefined && !row.disabled)
  if (leaf !== undefined) {
    add(`${open} on a row holding none does nothing`, [], leaf.label, [open], leaf.label)
    add(`${close} on a top-level row does nothing`, [], leaf.label, [close], leaf.label)
  }
  // APG: `*` opens every row beside the current one that holds rows.
  const beside = branches.filter(row => row.parent === topBranch.parent)
  if (beside.length > 1)
    add('* opens every row beside the current one', [], topBranch.label, ['*'], topBranch.label, {
      state: { open: openList(beside.map(row => row.label)) },
    })

  // Typeahead over the rows showing, enabled ones only.
  const initials = (label: string) => label[0]!.toLowerCase()
  const top = shownWith([]).filter(row => !row.disabled)
  for (const row of top.slice(1)) {
    const alike = top.filter(other => initials(other.label) === initials(row.label))
    if (alike.length === 1)
      add(
        `typing "${row.label[0]}" goes to ${row.label}`,
        [],
        top[0]!.label,
        [initials(row.label)],
        row.label,
      )
  }
  const barred = shownWith([]).find(
    row => row.disabled && top.every(other => initials(other.label) !== initials(row.label)),
  )
  if (barred !== undefined)
    add(
      `typing "${barred.label[0]}" never lands on the disabled ${barred.label}`,
      [],
      top[0]!.label,
      [initials(barred.label)],
      top[0]!.label,
    )
  // Two letters, typed together, tell apart rows that share an initial.
  for (const row of top) {
    const prefix = row.label.slice(0, 2).toLowerCase()
    const sharing = top.filter(other => initials(other.label) === initials(row.label))
    if (
      sharing.length > 1 &&
      top.filter(o => o.label.toLowerCase().startsWith(prefix)).length === 1
    )
      add(
        `typing "${row.label.slice(0, 2)}" goes to ${row.label}`,
        [],
        top[0]!.label,
        [...prefix],
        row.label,
      )
  }

  // Choosing.
  const chosenLeaf = rows.find(row => !row.branch && !row.disabled && row.depth === 1)!
  if (!checkable) {
    add('Enter chooses the row', [], chosenLeaf.label, ['Enter'], chosenLeaf.label, {
      state: { selected: chosenLeaf.label },
    })
    add(
      spec.enterToggles
        ? 'Enter on a row holding rows chooses it and opens it'
        : 'Enter on a row holding rows chooses it',
      [],
      topBranch.label,
      ['Enter'],
      topBranch.label,
      {
        state: {
          selected: topBranch.label,
          ...(spec.enterToggles ? { open: openList([topBranch.label]) } : {}),
        },
      },
    )
    add('Space chooses the row', [], chosenLeaf.label, [' '], chosenLeaf.label, {
      state: { selected: chosenLeaf.label },
    })
  } else {
    add('Space checks the row', [], chosenLeaf.label, [' '], chosenLeaf.label, {
      state: { checked: chosenLeaf.label },
    })
    add(
      'Space on a row holding rows checks every enabled row beneath it',
      [],
      topBranch.label,
      [' '],
      topBranch.label,
      {
        state: {
          checked: [...topBranch.leaves]
            .filter(label => !by.get(label)!.disabled)
            .sort()
            .join(','),
        },
      },
    )
    add(
      'Space twice leaves the row unchecked',
      [],
      chosenLeaf.label,
      [' ', ' '],
      chosenLeaf.label,
      {
        state: { checked: '' },
      },
    )
    add(
      'Enter chooses the row and checks nothing',
      [],
      chosenLeaf.label,
      ['Enter'],
      chosenLeaf.label,
      {
        state: { selected: chosenLeaf.label, checked: '' },
      },
    )
  }
  return made
}

// ---------------------------------------------------------------------------
// Running scenarios
// ---------------------------------------------------------------------------

/** One `test` per scenario: mount, press, and read what is current and what the state became. */
export const defineScenarios = <Setup>(
  adapter: Adapter<Setup>,
  scenarios: ReadonlyArray<Scenario<Setup>>,
) => {
  for (const scenario of scenarios) {
    const body = async () => {
      const mounted = await adapter.mount(scenario.setup)
      try {
        if (scenario.start !== undefined) {
          await vi.waitFor(() =>
            expect(mounted.current() && mounted.labelOf(mounted.current()!)).toBe(scenario.start),
          )
        }
        const prevented: Array<boolean> = []
        for (const key of scenario.keys) prevented.push(await press(key))
        const now = () => {
          const current = mounted.current()
          return current === undefined ? undefined : mounted.labelOf(current)
        }
        await vi.waitFor(() => expect(now()).toBe(scenario.focus))
        if (scenario.state !== undefined) {
          await vi.waitFor(() => expect(mounted.state()).toMatchObject(scenario.state!))
        }
        await settle()
        // Still there: nothing moved it again.
        expect(now()).toBe(scenario.focus)
        if (scenario.state !== undefined) expect(mounted.state()).toMatchObject(scenario.state)
        if (scenario.prevented === true) expect(prevented.every(Boolean)).toBe(true)
      } finally {
        mounted.dispose()
      }
    }
    const label = `${adapter.name}: ${scenario.name}`
    if (scenario.finding === undefined) test(label, body)
    else test.fails(label, body)
  }
}

// ---------------------------------------------------------------------------
// Names and relationships, as Chrome's accessibility tree has them
// ---------------------------------------------------------------------------

interface AxProperty {
  readonly name: string
  readonly value: { readonly value?: unknown }
}
interface AxNode {
  readonly ignored?: boolean
  readonly role?: { readonly value?: string }
  readonly name?: { readonly value?: string }
  readonly properties?: ReadonlyArray<AxProperty>
}
interface FlatNode {
  readonly nodeId: number
  readonly attributes?: ReadonlyArray<string>
}

export interface Ax {
  readonly role: string
  readonly name: string
  readonly ignored: boolean
  /** `selected`, `expanded`, `checked`, `disabled` and the rest of Chrome's properties, as strings. */
  readonly properties: Readonly<Record<string, string>>
}

/**
 * Each element's node in Chrome's own accessibility tree. Vitest's locators
 * compute names their own way, so a claim about a name reads Chrome's.
 * The page runs in a frame of Vitest's, so elements are found by a mark.
 */
export const axOf = async (elements: ReadonlyArray<Element>): Promise<ReadonlyArray<Ax>> => {
  await cdp().send('DOM.enable')
  await cdp().send('Accessibility.enable')
  elements.forEach((element, index) => element.setAttribute('data-conformance-ax', String(index)))
  try {
    const { nodes } = (await cdp().send('DOM.getFlattenedDocument', {
      depth: -1,
      pierce: true,
    })) as {
      nodes: ReadonlyArray<FlatNode>
    }
    const ids = new Map<number, number>()
    for (const node of nodes) {
      const attributes = node.attributes ?? []
      const at = attributes.indexOf('data-conformance-ax')
      if (at !== -1) ids.set(Number(attributes[at + 1]), node.nodeId)
    }
    const found: Array<Ax> = []
    for (let index = 0; index < elements.length; index++) {
      const nodeId = ids.get(index)
      if (nodeId === undefined) throw new Error(`element ${index} is not in the document`)
      const { nodes: tree } = (await cdp().send('Accessibility.getPartialAXTree', {
        nodeId,
        fetchRelatives: false,
      })) as { nodes: ReadonlyArray<AxNode> }
      const node = tree[0]
      if (node === undefined) throw new Error(`element ${index} has no accessibility node`)
      found.push({
        role: String(node.role?.value ?? ''),
        name: String(node.name?.value ?? ''),
        ignored: node.ignored === true,
        properties: Object.fromEntries(
          (node.properties ?? []).map(property => [property.name, String(property.value.value)]),
        ),
      })
    }
    return found
  } finally {
    elements.forEach(element => element.removeAttribute('data-conformance-ax'))
  }
}

/** The element each id in an `aria-*` reference names, or throws when one is missing. */
export const referenced = (element: Element, attribute: string): ReadonlyArray<HTMLElement> => {
  const value = element.getAttribute(attribute)
  if (value === null || value.trim() === '') return []
  return value
    .trim()
    .split(/\s+/)
    .map(id => {
      const target = document.getElementById(id)
      if (target === null) throw new Error(`${attribute}="${value}": no element has the id ${id}`)
      return target
    })
}

/** An `aria-*` state each element must carry, which Chrome must read the same. */
export interface StateRule {
  readonly attribute: string
  /** Chrome's name for it: `aria-selected` is `selected`. */
  readonly property: string
  readonly on: (mounted: Mounted) => ReadonlyArray<HTMLElement>
  /** The values it may take; a missing attribute is the failure this finds. */
  readonly values: ReadonlyArray<string>
}

/** A reference an element must carry, resolving to elements of a role. */
export interface RelationshipRule {
  readonly attribute: string
  readonly on: (mounted: Mounted) => ReadonlyArray<HTMLElement>
  /** The role the target is, in Chrome's tree. */
  readonly targetRole: string
  /** Names the target must have, per element, when the pattern fixes it. */
  readonly targetName?: ((mounted: Mounted, element: HTMLElement) => string) | undefined
}

export interface NamesSpec {
  readonly root: {
    readonly role: string
    readonly name: string
    /** Attributes of the root: a value, or `null` for absent. */
    readonly attributes?: Readonly<Record<string, string | null>>
    /** What Chrome reads of it, by its name for the property. */
    readonly properties?: Readonly<Record<string, string>>
  }
  readonly item: { readonly role: string }
  readonly states: ReadonlyArray<StateRule>
  readonly relationships: ReadonlyArray<RelationshipRule>
}

/** Role, name, states and references of a mounted widget, each read from Chrome. */
export const checkNames = async (mounted: Mounted, spec: NamesSpec) => {
  const items = mounted.items()
  expect(items.length).toBeGreaterThan(1)
  const [root, ...rest] = await axOf([mounted.root(), ...items])
  expect(root).toMatchObject({ role: spec.root.role, name: spec.root.name })
  for (const [attribute, value] of Object.entries(spec.root.attributes ?? {}))
    expect(mounted.root().getAttribute(attribute), `root ${attribute}`).toBe(value)
  expect(root!.properties).toMatchObject(spec.root.properties ?? {})
  for (const [index, ax] of rest.entries()) {
    const item = items[index]!
    expect(ax.role, `${mounted.labelOf(item)}: role`).toBe(spec.item.role)
    expect(ax.name, `${mounted.labelOf(item)}: name`).toBe(mounted.labelOf(item))
    expect(ax.ignored, `${mounted.labelOf(item)}: ignored`).toBe(false)
  }
  for (const rule of spec.states) {
    const elements = rule.on(mounted)
    expect(elements.length, `${rule.attribute}: elements`).toBeGreaterThan(0)
    const read = await axOf(elements)
    for (const [index, element] of elements.entries()) {
      const label = mounted.labelOf(element)
      const value = element.getAttribute(rule.attribute)
      expect(value, `${label}: ${rule.attribute}`).not.toBeNull()
      expect(rule.values, `${label}: ${rule.attribute}`).toContain(value)
      expect(read[index]!.properties[rule.property], `${label}: Chrome's ${rule.property}`).toBe(
        value,
      )
    }
  }
  for (const rule of spec.relationships) {
    const elements = rule.on(mounted)
    expect(elements.length, `${rule.attribute}: elements`).toBeGreaterThan(0)
    for (const element of elements) {
      const targets = referenced(element, rule.attribute)
      expect(targets.length, `${mounted.labelOf(element)}: ${rule.attribute}`).toBeGreaterThan(0)
      const read = await axOf(targets)
      for (const ax of read) {
        expect(ax.role, `${rule.attribute} of ${mounted.labelOf(element)}: role`).toBe(
          rule.targetRole,
        )
        if (rule.targetName !== undefined)
          expect(ax.name, `${rule.attribute} of ${mounted.labelOf(element)}: name`).toBe(
            rule.targetName(mounted, element),
          )
      }
    }
  }
}

export interface TabStop<Setup> {
  readonly name: string
  /** Mounted with focus on `start`: a roving widget holds its one tab stop there. */
  readonly setup: Setup
  readonly start: string
  /** A key that moves focus off `start`, and where it goes. */
  readonly move: string
  readonly moved: string
}

/** One tab stop: Tab enters on the current item and leaves past the widget, Shift+Tab comes back to it. */
export const defineTabStop = <Setup>(adapter: Adapter<Setup>, stop: TabStop<Setup>) => {
  test(`${adapter.name}: ${stop.name}`, async () => {
    const mounted = await adapter.mount(stop.setup)
    try {
      const entry = mounted.entry?.()
      if (entry === undefined) throw new Error(`${adapter.name} gives no element to Tab from`)
      const current = () => {
        const item = mounted.current()
        return item === undefined ? undefined : mounted.labelOf(item)
      }
      await vi.waitFor(() => expect(current()).toBe(stop.start))
      await press(stop.move)
      await vi.waitFor(() => expect(current()).toBe(stop.moved))
      entry.focus()
      expect(current()).toBeUndefined()
      await press('Tab')
      await vi.waitFor(() => expect(current()).toBe(stop.moved))
      // Past the items, not onto another: the widget is one stop.
      await press('Tab')
      await settle()
      expect(current()).toBeUndefined()
      expect(mounted.items().includes(document.activeElement as HTMLElement)).toBe(false)
      await press('Shift+Tab')
      await vi.waitFor(() => expect(current()).toBe(stop.moved))
      await press('Shift+Tab')
      await settle()
      expect(current()).toBeUndefined()
      expect(document.activeElement).toBe(entry)
    } finally {
      mounted.dispose()
    }
  })
}

export interface Activation<Setup> {
  readonly name: string
  readonly setup: Setup
  /** Keys that take focus from the start to `target`; the press on `target` needs none. */
  readonly reach: ReadonlyArray<string>
  readonly target: string
  /** The ways to activate it; all three by default. */
  readonly by?: ReadonlyArray<'Enter' | ' ' | 'click'>
  /** What `state()` holds once the target is activated, however it was. */
  readonly state: Readonly<Record<string, string>>
}

const HOW = { Enter: 'Enter', ' ': 'Space', click: 'a press' } as const

/**
 * Enter, Space and a press on the item reach the same result: three mounts,
 * each ending in the state named, which is what a Message the three share
 * would have produced.
 */
export const defineActivation = <Setup>(adapter: Adapter<Setup>, activation: Activation<Setup>) => {
  for (const how of activation.by ?? (['Enter', ' ', 'click'] as const)) {
    test(`${adapter.name}: ${activation.name} by ${HOW[how]}`, async () => {
      const mounted = await adapter.mount(activation.setup)
      try {
        const before = { ...mounted.state() }
        if (how === 'click') {
          const item = mounted.items().find(each => mounted.labelOf(each) === activation.target)
          if (item === undefined) throw new Error(`no item is labelled ${activation.target}`)
          await userEvent.click(item)
        } else {
          for (const key of activation.reach) await press(key)
          await vi.waitFor(() =>
            expect(mounted.current() && mounted.labelOf(mounted.current()!)).toBe(
              activation.target,
            ),
          )
          await press(how)
        }
        await vi.waitFor(() => expect(mounted.state()).toMatchObject(activation.state))
        await settle()
        expect(mounted.state()).toMatchObject(activation.state)
        // Not vacuous: something changed.
        expect(mounted.state()).not.toEqual(before)
      } finally {
        mounted.dispose()
      }
    })
  }
}

export interface Refusal<Setup> {
  readonly name: string
  readonly setup: Setup
  /** A disabled item. */
  readonly target: string
}

/**
 * A press on a disabled item changes nothing. Where focus goes is the browser's
 * to say (a native `disabled` control drops it), so it is not asserted.
 */
export const defineRefusal = <Setup>(adapter: Adapter<Setup>, refusal: Refusal<Setup>) => {
  test(`${adapter.name}: ${refusal.name}`, async () => {
    const mounted = await adapter.mount(refusal.setup)
    try {
      const item = mounted.items().find(each => mounted.labelOf(each) === refusal.target)
      if (item === undefined) throw new Error(`no item is labelled ${refusal.target}`)
      const before = { ...mounted.state() }
      await userEvent.click(item, { force: true })
      await settle()
      expect(mounted.state()).toEqual(before)
    } finally {
      mounted.dispose()
    }
  })
}
