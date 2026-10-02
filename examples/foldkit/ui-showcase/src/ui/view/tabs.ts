import { Array, Match } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Tabs as UiTabs } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Tabs } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import { type DemoTab, type UiModel } from '../model.js'
import {
  HorizontalTabsStyle,
  TabsPageSlots,
  TabsPageStyle,
  VerticalTabsStyle,
} from '../style/tabs.js'

const demoTabs: ReadonlyArray<DemoTab> = ['Foldkit', 'React', 'Elm']

// Annotated because the inferred type names a `foldkit` internal module.
export const DemoTabs: UiTabs.Bundle<DemoTab> = UiTabs.create<DemoTab>()

type Slots = SlotBuilders<typeof TabsPageSlots, UiMessage>

type PanelText = Readonly<{ emphasis: string; lead: string; note: string }>

const panelText = (tab: DemoTab): PanelText =>
  Match.value(tab).pipe(
    Match.when('Foldkit', () => ({
      emphasis: 'Model-View-Update',
      lead: ' with Effect. A single immutable model holds all state, messages describe what happened, and a pure update function produces the next state.',
      note: 'Composable Elm Architecture modules, Schema-typed state, and controlled side effects via Effect.',
    })),
    Match.when('React', () => ({
      emphasis: 'Component-based',
      lead: ' with hooks for state and effects. Each component manages its own local state via useState and useReducer.',
      note: 'JSX views, hooks-driven state, and implicit side effects via useEffect.',
    })),
    Match.when('Elm', () => ({
      emphasis: 'The original Elm Architecture',
      lead: '. Elm pioneered the Model-View-Update architecture with a pure functional language. Foldkit brings these ideas to TypeScript.',
      note: 'Pure functional language, Cmd/Sub for effects, and compiler-guaranteed correctness.',
    })),
    Match.exhaustive,
  )

const panelFor = (tab: DemoTab, slots: Slots, h: HtmlBuilder<UiMessage>): Html => {
  const { emphasis, lead, note } = panelText(tab)

  return h.div(slots.panelContent.attrs(), [
    h.p(slots.panelLead.attrs(), [h.span(slots.panelEmphasis.attrs(), [emphasis]), lead]),
    h.p(slots.panelNote.attrs(), [note]),
  ])
}

type TabsDemo = Readonly<{
  tabs: UiTabs.Model
  selectedValue: DemoTab
  isVertical: boolean
  toParentMessage: (message: UiTabs.Message) => UiMessage
}>

const tabsDemo = (demo: TabsDemo, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.submodel({
    slotId: demo.tabs.id,
    model: demo.tabs,
    view: DemoTabs.view,
    viewInputs: {
      tabs: demoTabs,
      selectedValue: demo.selectedValue,
      ariaLabel: 'Framework comparison tabs',
      ...(demo.isVertical ? { orientation: 'Vertical' as const } : {}),
      toView: render => {
        const { tablist, tabs, activeIndex } = Tabs.resolve(
          render,
          [(demo.isVertical ? VerticalTabsStyle : HorizontalTabsStyle).mixin],
          { input: undefined, h },
        )

        return h.div((demo.isVertical ? slots.vertical : slots.horizontal).attrs(), [
          h.div(
            tablist,
            tabs.map(tab => h.button(tab.tab, [h.span(slots.tabLabel.attrs(), [tab.value])])),
          ),
          ...Array.map(
            Array.filter(tabs, tab => tab.index === activeIndex),
            tab => h.div(tab.panel, [panelFor(tab.value, slots, h)]),
          ),
        ])
      },
    },
    toParentMessage: demo.toParentMessage,
  })

const TabsPage = SlotView.forMessages<UiMessage>()
  .define(TabsPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Tabs']),

      h.h3(slots.section.attrs(), ['Horizontal']),
      tabsDemo(
        {
          tabs: model.horizontalTabsDemo,
          selectedValue: model.horizontalTabsDemoTab,
          isVertical: false,
          toParentMessage: message => UiMessage.GotHorizontalTabsDemoMessage({ message }),
        },
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Vertical']),
      tabsDemo(
        {
          tabs: model.verticalTabsDemo,
          selectedValue: model.verticalTabsDemoTab,
          isVertical: true,
          toParentMessage: message => UiMessage.GotVerticalTabsDemoMessage({ message }),
        },
        slots,
        h,
      ),
    ]),
  )
  .pipe(Style.attach(TabsPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(TabsPage)
