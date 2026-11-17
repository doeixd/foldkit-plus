/**
 * The Navigation section as an island: tabs, a plan picker, a pager and a breadcrumb.
 */
import { Schema } from 'effect'
import { Runtime, Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Tabs as UiTabs } from '@foldkit/ui'
import { SlotView } from 'foldkit-mixins'
import { Breadcrumb, Pagination, Segmented, Tabs } from 'foldkit-mixins-ui'
import {
  BreadcrumbStyle,
  LineTabsStyle,
  PageStyle,
  PaginationStyle,
  PillTabsStyle,
  PlanStyle,
} from '../style.js'
import { PageSlots } from '../slots.js'
import { foldsFor } from '../fold.js'
import { neverH } from '../shared.js'

const LineTab = Schema.Union([
  Schema.Literal('overview'),
  Schema.Literal('account'),
  Schema.Literal('settings'),
])

type LineTab = typeof LineTab.Type

const PillTab = Schema.Union([
  Schema.Literal('day'),
  Schema.Literal('week'),
  Schema.Literal('month'),
])

type PillTab = typeof PillTab.Type

const Plan = Schema.Union([
  Schema.Literal('starter'),
  Schema.Literal('pro'),
  Schema.Literal('enterprise'),
])

type Plan = typeof Plan.Type

const SectionsTabs = UiTabs.create<LineTab>()

const RangeTabs = UiTabs.create<PillTab>()

export const Model = Schema.Struct({
  lineTab: LineTab,
  pillTab: PillTab,
  plan: Plan,
  page: Schema.Number,
  sectionsTabs: UiTabs.Model,
  rangeTabs: UiTabs.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  PlanSelected: { plan: Plan },
  PageSelected: { page: Schema.Number },
  SectionsTabs: { message: UiTabs.Message },
  RangeTabs: { message: UiTabs.Message },
})
export type Message = typeof Message.Type

export const initModel = (): Model => ({
  lineTab: 'overview',
  pillTab: 'week',
  plan: 'pro',
  page: 1,
  sectionsTabs: UiTabs.init({ id: 'sections-tabs' }),
  rangeTabs: UiTabs.init({ id: 'range-tabs' }),
})

const own = foldsFor<Model, Message>()

const foldSectionsTabs = Update.foldChild({
  ...own('sectionsTabs', Message.SectionsTabs),
  update: SectionsTabs.update,
  foldOutMessage: UiTabs.OutMessage.match<Update.Step<Model, Message>, UiTabs.OutMessage<LineTab>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { lineTab: () => value }),
      }),
  }),
})

const foldRangeTabs = Update.foldChild({
  ...own('rangeTabs', Message.RangeTabs),
  update: RangeTabs.update,
  foldOutMessage: UiTabs.OutMessage.match<Update.Step<Model, Message>, UiTabs.OutMessage<PillTab>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { pillTab: () => value }),
      }),
  }),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    PlanSelected: ({ plan }) => ({ model: modifyFields(model, { plan: () => plan }) }),
    PageSelected: ({ page }) => ({ model: modifyFields(model, { page: () => page }) }),
    SectionsTabs: ({ message }) => foldSectionsTabs(model, message),
    RangeTabs: ({ message }) => foldRangeTabs(model, message),
  })

const lineTabs: ReadonlyArray<{ readonly value: LineTab; readonly label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'account', label: 'Account' },
  { value: 'settings', label: 'Settings' },
]

const pillTabs: ReadonlyArray<{ readonly value: PillTab; readonly label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const plans: ReadonlyArray<{ readonly value: Plan; readonly label: string }> = [
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

/**
 * The section tabs, live: the component owns focus and arrow-key movement,
 * the Model owns which tab shows. Only the active panel renders.
 */
const tabPanels: Record<LineTab, string> = {
  overview: 'Overview: everything, one screen.',
  account: 'Account: who pays and who belongs.',
  settings: 'Settings: knobs for the whole page.',
}

const LineTabsView = (
  model: Pick<Model, 'lineTab' | 'sectionsTabs'>,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: model.sectionsTabs.id,
    model: model.sectionsTabs,
    view: SectionsTabs.view,
    viewInputs: {
      tabs: lineTabs.map(tab => tab.value),
      selectedValue: model.lineTab,
      ariaLabel: 'Sections',
      toView: render => {
        const resolved = Tabs.resolve(render, [LineTabsStyle.mixin], { input: undefined, h })
        // The panel stands under the tab list, not in it: in the list's flex row it took what the tabs left,
        // and a wide font at a phone's width made it a column too narrow for its words.
        return h.div(
          [],
          [
            h.div(
              resolved.tablist,
              resolved.tabs.map(tab =>
                h.button(tab.tab, [lineTabs[tab.index]?.label ?? tab.value]),
              ),
            ),
            ...resolved.tabs
              .filter(tab => tab.index === resolved.activeIndex)
              .map(tab => h.div(tab.panel, [tabPanels[tab.value]])),
          ],
        )
      },
    },
    toParentMessage: message => Message.SectionsTabs({ message }),
  })

const PillTabsView = (model: Pick<Model, 'pillTab' | 'rangeTabs'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.rangeTabs.id,
    model: model.rangeTabs,
    view: RangeTabs.view,
    viewInputs: {
      tabs: pillTabs.map(tab => tab.value),
      selectedValue: model.pillTab,
      ariaLabel: 'Range',
      toView: render => {
        const resolved = Tabs.resolve(render, [PillTabsStyle.mixin], { input: undefined, h })
        return h.div(resolved.tablist, [
          ...resolved.tabs.map(tab => h.button(tab.tab, [pillTabs[tab.index]?.label ?? tab.value])),
        ])
      },
    },
    toParentMessage: message => Message.RangeTabs({ message }),
  })

const PlanView = (active: Plan, h: HtmlBuilder<Message>): Html =>
  Segmented.view(
    {
      id: 'plan-choice',
      label: 'Plan',
      options: plans,
      pressed: [active],
      onPress: plan => Message.PlanSelected({ plan }),
      style: PlanStyle,
    },
    h,
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      'Tabs in line and pill variants, and a Segmented plan picker — all driven by this page\u2019s own tab state.',
    ]),
    LineTabsView(model, h),
    PillTabsView(model, h),
    PlanView(model.plan, h),
    h.p(slots.sectionText.attrs(), [
      `Showing ${model.lineTab}, ${model.pillTab} view, ${model.plan} plan.`,
    ]),
    Pagination.view(
      {
        page: model.page,
        pageCount: 10,
        onPage: page => Message.PageSelected({ page }),
        style: PaginationStyle,
      },
      h,
    ),
    h.p(slots.sectionText.attrs(), [`Page ${model.page} of 10.`]),
    Breadcrumb.view(
      {
        steps: [
          { label: 'Projects', href: '#' },
          { label: 'Website', href: '#' },
          { label: 'Launch checklist', current: true },
        ],
        style: BreadcrumbStyle,
      },
      neverH,
    ),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel() }),
      update,
      view,
    }),
  )
}
