// @vitest-environment jsdom
/**
 * `<Widget>.conflict(routes, input?)` is the diagnostic that drawing the widget
 * with those routes throws, asked without drawing. The table holds the widgets
 * that take application key routes; each subject draws the real view on the
 * inert builder, so a check that drifts from its view fails here.
 */
import * as TabsUi from '@foldkit/ui/tabs'
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Behaviors, type Diagnostic } from 'foldkit-mixins'
import {
  CascadeSelect,
  Command,
  FloatingPanel,
  Menubar,
  Nav,
  Picker,
  SearchField,
  Tabs,
  TagsInput,
  Toolbar,
  Tour,
} from '../src/index.js'
import { diagnosticFrom, h, message, type TestMessage } from './fixture.js'

const { Keys } = Behaviors
const other = message('Other')
const none = () => Option.none()

/**
 * Drawn in a runtime frame, which a widget that nests a Menu or a Listbox
 * needs once nothing throws before it; the inert builder serves the rest.
 */
const drawnInScene = (view: (h: HtmlBuilder<TestMessage>) => Html): void =>
  Scene.scene<null, TestMessage>(
    { update: model => ({ model }), view: (_, h) => view(h) },
    Scene.given(null),
  )

type Gesture = Behaviors.Keys.Gesture

/** A widget's check beside the drawing it must agree with, over the same routes and input. */
interface Subject<Route, Input> {
  readonly route: (name: string, on: Gesture) => Route
  readonly conflict: (routes: ReadonlyArray<Route>, input: Input) => Option.Option<Diagnostic>
  readonly draw: (routes: ReadonlyArray<Route>, input: Input) => void
}

const compare =
  <Route, Input>(subject: Subject<Route, Input>, input: Input) =>
  (...keys: ReadonlyArray<Gesture>) => {
    const routes = keys.map((on, index) => subject.route(`app-${index}`, on))
    return {
      found: Option.getOrUndefined(subject.conflict(routes, input)),
      drawn: diagnosticFrom(() => subject.draw(routes, input)),
    }
  }

const command: Subject<Command.CommandRoute<string, TestMessage>, undefined> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: routes => Command.conflict(routes),
  draw: routes =>
    Command.view<string, TestMessage>(
      {
        id: 'palette',
        label: 'Commands',
        groups: [{ heading: 'Pages', items: [{ value: 'new', label: 'New page' }] }],
        query: '',
        onQuery: () => other,
        active: Option.none(),
        onActive: () => other,
        onRun: () => other,
        routes,
      },
      h,
    ),
}

const searchField: Subject<SearchField.Route<TestMessage>, undefined> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: routes => SearchField.conflict(routes),
  draw: routes =>
    SearchField.view(
      {
        id: 'find',
        label: 'Search products',
        value: 'lamp',
        onInput: () => other,
        onClear: other,
        routes,
      },
      h,
    ),
}

type MenubarInput = Pick<Menubar.MenubarView<TestMessage>, 'direction'>
const menubar: Subject<Menubar.Route<TestMessage>, MenubarInput> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: Menubar.conflict,
  draw: (routes, input) =>
    drawnInScene(h =>
      Menubar.view(
        {
          label: 'Editor',
          model: Menubar.init(['file']),
          menus: [{ label: 'File', rows: [{ value: 'New', label: 'New' }] }],
          onMessage: () => other,
          routes,
          ...input,
        },
        h,
      ),
    ),
}

const config: CascadeSelect.Config = { nodes: [{ id: 'ca', label: 'Canada' }] }
const cascadeSelect: Subject<CascadeSelect.Route<TestMessage>, undefined> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: routes => CascadeSelect.conflict(routes),
  draw: routes =>
    CascadeSelect.view(
      {
        model: CascadeSelect.init({ id: 'place' }),
        config,
        onMessage: () => other,
        label: 'Place',
        routes,
      },
      h,
    ),
}

type PanelInput = Pick<FloatingPanel.FloatingPanelView<TestMessage>, 'closeOnEscape'>
const floatingPanel: Subject<FloatingPanel.Route<TestMessage>, PanelInput> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: FloatingPanel.conflict,
  draw: (routes, input) =>
    FloatingPanel.view(
      {
        model: FloatingPanel.open(
          FloatingPanel.init({ id: 'notes', rect: { x: 0, y: 0, width: 300, height: 200 } }),
        ).model,
        onMessage: () => other,
        title: 'Notes',
        content: h.p([], ['Body']),
        routes,
        ...input,
      },
      h,
    ),
}

const tourConfig: Tour.Config = { steps: [{ title: 'Welcome', description: 'A step.' }] }
type TourInput = Pick<Tour.TourView<TestMessage>, 'closeOnEscape'>
const tour: Subject<Tour.Route<TestMessage>, TourInput> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: Tour.conflict,
  draw: (routes, input) =>
    Tour.view(
      {
        model: Tour.start(Tour.init({ id: 'tour' }), tourConfig).model,
        config: tourConfig,
        onMessage: () => other,
        routes,
        ...input,
      },
      h,
    ),
}

const picker: Subject<Picker.Route<TestMessage>, undefined> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: routes => Picker.conflict(routes),
  draw: routes =>
    drawnInScene(h =>
      Picker.view(
        {
          model: Picker.init({ id: 'sort' }),
          onMessage: () => other,
          label: 'Sort',
          options: [{ value: 'a', label: 'A' }],
          value: Option.none(),
          placeholder: 'Sort by',
          routes,
        },
        h,
      ),
    ),
}

const entries: ReadonlyArray<Nav.NavEntry> = [
  { label: 'Home', href: '#home' },
  { id: 'docs', label: 'Docs', groups: [{ links: [{ label: 'Guides', href: '#guides' }] }] },
]
const navView = (extra: Partial<Nav.NavView<TestMessage>>) =>
  Nav.view(
    {
      model: { ...Nav.init('site'), open: Option.none() },
      entries,
      label: 'Site',
      onMessage: () => other,
      ...extra,
    },
    h,
  )
const nav: Subject<Nav.Route<TestMessage>, undefined> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: routes => Nav.conflict(routes),
  draw: routes => navView({ routes }),
}
const navPanel: Subject<Nav.PanelRoute<TestMessage>, undefined> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: panelRoutes => Nav.conflict([], { panelRoutes }),
  draw: panelRoutes => navView({ panelRoutes }),
}

const DemoTabs = TabsUi.create<'overview'>()
const selected = TabsUi.Message.SelectedTab({ index: 0, value: 'overview' })
type TabsInput = Pick<Tabs.TabsContext<'overview', undefined, TabsUi.Message>, 'close'>
const tabs: Subject<Tabs.Route<'overview', TabsUi.Message>, TabsInput> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: Tabs.conflict,
  draw: (routes, input) =>
    Scene.scene<TabsUi.Model, TabsUi.Message>(
      {
        update: model => ({ model }),
        view: (model, h) =>
          DemoTabs.view(
            model,
            {
              tabs: ['overview'] as const,
              selectedValue: 'overview',
              ariaLabel: 'Sections',
              toView: render => {
                const resolved = Tabs.resolve(render, [], { input: undefined, h, routes, ...input })
                return h.div(
                  [...resolved.tablist],
                  resolved.tabs.map(item => h.button([...item.tab], [item.value])),
                )
              },
            },
            h,
          ),
      },
      Scene.given(TabsUi.init({ id: 'tabs' })),
    ),
}
const closing: TabsInput = { close: { onClose: () => selected } }

type TagsInput = Pick<TagsInput.Model, 'delimiter'> &
  Pick<TagsInput.TagsInputView<TestMessage>, 'direction'>
const tagsInput: Subject<TagsInput.Route<TestMessage>, Partial<TagsInput>> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: TagsInput.conflict,
  draw: (routes, { delimiter, direction }) =>
    TagsInput.view(
      {
        model: TagsInput.init({ id: 'topics', delimiter }),
        onMessage: () => other,
        label: 'Topics',
        routes,
        direction,
      },
      h,
    ),
}

type ToolbarInput = Pick<Toolbar.ToolbarView<TestMessage>, 'orientation'>
const toolbar: Subject<Behaviors.Keys.Route<undefined, TestMessage>, ToolbarInput> = {
  route: (name, on) => Keys.route(name, { on: [on], handle: none }),
  conflict: Toolbar.conflict,
  draw: (routes, input) =>
    Toolbar.view(
      {
        id: 'bar',
        label: 'Formatting',
        items: [{ id: 'bold', draw: ({ attributes }) => h.button([...attributes], ['bold']) }],
        roving: { current: null },
        onFocus: () => other,
        routes,
        ...input,
      },
      h,
    ),
}

const chord = Keys.chord
const F9 = chord('F9')

/** Each widget with a key it owns, the name of the own route that takes it, and the input that makes it own it. */
const widgets = [
  ['Command', compare(command, undefined), chord('ArrowDown'), 'Next'],
  ['SearchField', compare(searchField, undefined), chord('Escape'), 'Clear'],
  ['Menubar', compare(menubar, {}), chord('Home'), 'Menubar Home'],
  ['CascadeSelect', compare(cascadeSelect, undefined), chord('Home'), 'Cascade Home'],
  ['Tour', compare(tour, {}), chord('ArrowRight'), 'Tour ArrowRight'],
  ['FloatingPanel', compare(floatingPanel, {}), chord('Escape'), 'Close on Escape'],
  ['Picker', compare(picker, undefined), chord('Home'), 'Step Home'],
  ['Nav', compare(nav, undefined), chord('Home'), 'Nav Home'],
  ['Nav panel', compare(navPanel, undefined), chord('ArrowUp'), 'Nav panel ArrowUp'],
  ['Tabs', compare(tabs, closing), chord('Delete'), 'Close'],
  ['TagsInput', compare(tagsInput, {}), chord('Enter'), 'Commit'],
  ['Toolbar', compare(toolbar, {}), chord('End'), 'Toolbar'],
] as const

describe.each(widgets)('%s.conflict', (_, check, owned, ownName) => {
  it('names the key and both routes when an application route takes a key the widget owns', () => {
    const { found, drawn } = check(owned)
    expect(found?.code).toBe('mixins:key-conflict')
    expect(found?.details?.['contributors']).toEqual([ownName, 'app-0'])
    expect(found).toEqual(drawn)
  })

  it('is none for a free key, as drawing is', () => {
    const { found, drawn } = check(F9)
    expect(found).toBeUndefined()
    expect(drawn).toBeUndefined()
  })

  it('reports two application routes on one key, as drawing does', () => {
    const { found, drawn } = check(F9, F9)
    expect(found?.details?.['contributors']).toEqual(['app-0', 'app-1'])
    expect(found).toEqual(drawn)
  })
})

describe('conflict follows the input the view is given', () => {
  it.each([
    [
      'Menubar, right to left, names the swapped arrow',
      compare(menubar, { direction: 'rtl' }),
      'ArrowLeft',
      'Menubar ArrowRight',
    ],
    [
      'Menubar, left to right',
      compare(menubar, { direction: 'ltr' }),
      'ArrowLeft',
      'Menubar ArrowLeft',
    ],
  ] as const)('%s', (_, check, key, ownName) => {
    const { found, drawn } = check(chord(key))
    expect(found?.details?.['contributors']).toEqual([ownName, 'app-0'])
    expect(found).toEqual(drawn)
  })

  it.each([
    ['Tour', compare(tour, { closeOnEscape: false }), compare(tour, {})],
    ['FloatingPanel', compare(floatingPanel, { closeOnEscape: false }), compare(floatingPanel, {})],
  ] as const)('%s leaves Escape free once it is not the close key', (_, off, on) => {
    expect(off(chord('Escape'))).toEqual({ found: undefined, drawn: undefined })
    const { found, drawn } = on(chord('Escape'))
    expect(found?.code).toBe('mixins:key-conflict')
    expect(found).toEqual(drawn)
  })

  it('Tabs owns Delete only while the tabs are closable', () => {
    expect(compare(tabs, {})(chord('Delete'))).toEqual({ found: undefined, drawn: undefined })
    const { found, drawn } = compare(tabs, closing)(chord('Delete'))
    expect(found?.code).toBe('mixins:key-conflict')
    expect(found).toEqual(drawn)
  })

  it.each([
    ['horizontal', 'ArrowDown', false],
    ['horizontal', 'ArrowRight', true],
    ['vertical', 'ArrowDown', true],
    ['vertical', 'ArrowRight', false],
  ] as const)('Toolbar, %s, owns %s: %s', (orientation, key, owns) => {
    const { found, drawn } = compare(toolbar, { orientation })(chord(key))
    expect(found !== undefined).toBe(owns)
    expect(found).toEqual(drawn)
  })

  it.each([
    ['the default delimiter', {}, ',', true],
    ['a given delimiter', { delimiter: ';' }, ';', true],
    ['a given delimiter, leaving the comma free', { delimiter: ';' }, ',', false],
    ['left to right, the arrow into the chips', { direction: 'ltr' }, 'ArrowLeft', true],
    ['left to right, the other arrow', { direction: 'ltr' }, 'ArrowRight', false],
    ['right to left, the arrow into the chips', { direction: 'rtl' }, 'ArrowRight', true],
    ['right to left, the other arrow', { direction: 'rtl' }, 'ArrowLeft', false],
  ] as const)('TagsInput, %s: %s', (_, input, key, owns) => {
    const { found, drawn } = compare(tagsInput, input)(chord(key))
    expect(found !== undefined).toBe(owns)
    expect(found).toEqual(drawn)
  })

  it('Nav checks the panel routes beside the row routes, the row first', () => {
    expect(Option.getOrUndefined(Nav.conflict([], { panelRoutes: [] }))).toBeUndefined()
    const row = nav.route('row', chord('Home'))
    const panel = navPanel.route('panel', chord('Home'))
    const found = Option.getOrUndefined(Nav.conflict([row], { panelRoutes: [panel] }))
    expect(found?.details?.['contributors']).toEqual(['Nav Home', 'row'])
  })

  it('CascadeSelect owns every printable character', () => {
    const { found, drawn } = compare(cascadeSelect, undefined)(Keys.printable)
    expect(found?.details?.['contributors']).toEqual(['Cascade typeahead', 'app-0'])
    expect(found).toEqual(drawn)
  })
})
