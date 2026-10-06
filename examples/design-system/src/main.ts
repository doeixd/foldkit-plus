/**
 * An interactive showcase of the `foldkit-mixins` + `foldkit-mixins-ui`
 * design system, styled to read like shadcn: zinc-like surfaces, hairline
 * borders, roomy corners, black primary buttons, and a red destructive tone.
 *
 * The application state is ordinary local UI state (hue, scheme, tabs, form
 * drafts, toggles, a click counter); every control draws through a shipped
 * recipe, so the page is the documentation.
 */
import { Schema } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiSwitch from '@foldkit/ui/switch'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import {
  Button,
  Checkbox,
  DialogSlots,
  Input,
  SegmentedSlots,
  Switch,
  TabsSlots,
  Textarea,
} from 'foldkit-mixins-ui'
import {
  AreaStyle,
  BadgeSlots,
  CardSlots,
  CardStyle,
  CheckStyle,
  DestructiveButtonStyle,
  DialogPreviewStyle,
  FieldStyle,
  FilledFieldStyle,
  GhostButtonStyle,
  LargeButtonStyle,
  LineTabsStyle,
  OutlineButtonStyle,
  PageSlots,
  PageStyle,
  PillTabsStyle,
  PlanStyle,
  PrimaryButtonStyle,
  SecondaryButtonStyle,
  SmallButtonStyle,
  StatusStyle,
  ToggleStyle,
} from './style.js'

// --- model -------------------------------------------------------------------

const Scheme = Schema.Union([
  Schema.Literal('system'),
  Schema.Literal('light'),
  Schema.Literal('dark'),
])
type Scheme = typeof Scheme.Type

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

export const Model = Schema.Struct({
  hue: Schema.Number,
  scheme: Scheme,
  lineTab: LineTab,
  pillTab: PillTab,
  plan: Plan,
  name: Schema.String,
  bio: Schema.String,
  marketing: Schema.Boolean,
  notifications: Schema.Boolean,
  clicks: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  HueSelected: { hue: Schema.Number },
  SchemeSelected: { scheme: Scheme },
  LineTabSelected: { tab: LineTab },
  PillTabSelected: { tab: PillTab },
  PlanSelected: { plan: Plan },
  NameTyped: { value: Schema.String },
  BioTyped: { value: Schema.String },
  MarketingToggled: { value: Schema.Boolean },
  NotificationsToggled: { value: Schema.Boolean },
  ButtonClicked: {},
})
export type Message = typeof Message.Type

export const initialModel: Model = {
  hue: 222,
  scheme: 'system',
  lineTab: 'overview',
  pillTab: 'week',
  plan: 'pro',
  name: '',
  bio: '',
  marketing: true,
  notifications: false,
  clicks: 0,
}

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    HueSelected: ({ hue }) => ({ model: modifyFields(model, { hue: () => hue }) }),
    SchemeSelected: ({ scheme }) => ({ model: modifyFields(model, { scheme: () => scheme }) }),
    LineTabSelected: ({ tab }) => ({ model: modifyFields(model, { lineTab: () => tab }) }),
    PillTabSelected: ({ tab }) => ({ model: modifyFields(model, { pillTab: () => tab }) }),
    PlanSelected: ({ plan }) => ({ model: modifyFields(model, { plan: () => plan }) }),
    NameTyped: ({ value }) => ({ model: modifyFields(model, { name: () => value }) }),
    BioTyped: ({ value }) => ({ model: modifyFields(model, { bio: () => value }) }),
    MarketingToggled: ({ value }) => ({
      model: modifyFields(model, { marketing: () => value }),
    }),
    NotificationsToggled: ({ value }) => ({
      model: modifyFields(model, { notifications: () => value }),
    }),
    ButtonClicked: () => ({ model: modifyFields(model, { clicks: clicks => clicks + 1 }) }),
  })

// --- views -------------------------------------------------------------------

type PageBuilders = SlotBuilders<typeof PageSlots, Message>

const hues: ReadonlyArray<{ readonly label: string; readonly hue: number }> = [
  { label: 'Slate', hue: 222 },
  { label: 'Violet', hue: 270 },
  { label: 'Teal', hue: 172 },
  { label: 'Amber', hue: 38 },
  { label: 'Rose', hue: 336 },
]

const schemes: ReadonlyArray<{ readonly label: string; readonly scheme: Scheme }> = [
  { label: 'System', scheme: 'system' },
  { label: 'Light', scheme: 'light' },
  { label: 'Dark', scheme: 'dark' },
]

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

const LineTabsView = SlotView.forMessages<Message>()
  .define(TabsSlots, (active: LineTab, slots, h) =>
    h.div(slots.tablist.attrs([h.Role('tablist'), h.AriaLabel('Sections')]), [
      ...lineTabs.map(tab =>
        h.button(
          slots.tab.attrs([
            h.Type('button'),
            h.Role('tab'),
            h.AriaSelected(active === tab.value),
            h.OnClick(Message.LineTabSelected({ tab: tab.value })),
          ]),
          [tab.label],
        ),
      ),
    ]),
  )
  .pipe(Style.attach(LineTabsStyle))

const PillTabsView = SlotView.forMessages<Message>()
  .define(TabsSlots, (active: PillTab, slots, h) =>
    h.div(slots.tablist.attrs([h.Role('tablist'), h.AriaLabel('Range')]), [
      ...pillTabs.map(tab =>
        h.button(
          slots.tab.attrs([
            h.Type('button'),
            h.Role('tab'),
            h.AriaSelected(active === tab.value),
            h.OnClick(Message.PillTabSelected({ tab: tab.value })),
          ]),
          [tab.label],
        ),
      ),
    ]),
  )
  .pipe(Style.attach(PillTabsStyle))

const PlanView = SlotView.forMessages<Message>()
  .define(SegmentedSlots, (active: Plan, slots, h) =>
    h.div(slots.group.attrs([h.Role('group'), h.AriaLabel('Plan')]), [
      ...plans.map(plan =>
        h.button(
          slots.option.attrs([
            h.Type('button'),
            h.AriaPressed(active === plan.value ? 'true' : 'false'),
            h.OnClick(Message.PlanSelected({ plan: plan.value })),
          ]),
          [plan.label],
        ),
      ),
    ]),
  )
  .pipe(Style.attach(PlanStyle))

const BadgesView = SlotView.forMessages<Message>()
  .define(BadgeSlots, (_input: unknown, slots, h) =>
    h.div(slots.row.attrs(), [
      ...(
        [
          ['plain', 'Draft'],
          ['ok', 'Live'],
          ['warn', 'Expiring'],
          ['info', 'New'],
          ['bad', 'Failed'],
        ] as const
      ).map(([state, label]) =>
        h.span(slots.badge.attrs([h.DataAttribute('state', state)]), [label]),
      ),
    ]),
  )
  .pipe(Style.attach(StatusStyle.style))

const DialogPreview = SlotView.forMessages<Message>()
  .define(DialogSlots, (_input: unknown, slots, h) =>
    h.div(slots.panel.attrs([h.Style({ position: 'static', transform: 'none' })]), [
      h.h2(slots.title.attrs(), ['Delete this project?']),
      h.p(slots.description.attrs(), [
        'It goes for good, with its history. This panel is drawn in place, not opened as a modal.',
      ]),
      h.div(
        [],
        [
          Button.view(
            { label: 'Delete', style: DestructiveButtonStyle, onClick: Message.ButtonClicked() },
            h,
          ),
          Button.view({ label: 'Cancel', style: GhostButtonStyle }, h),
        ],
      ),
    ]),
  )
  .pipe(Style.attach(DialogPreviewStyle))

const CardView = SlotView.forMessages<Message>()
  .define(CardSlots, (clicks: number, slots, h) =>
    h.article(slots.card.attrs(), [
      h.h3(slots.title.attrs(), ['Usage this month']),
      h.p(slots.description.attrs(), ['Synced just now']),
      h.p(slots.content.attrs(), [
        `The team pressed a button ${clicks} ${clicks === 1 ? 'time' : 'times'}. A card is page slots plus a recipe: no new CSS.`,
      ]),
      h.div(slots.footer.attrs(), [
        Button.view(
          { label: 'View report', style: PrimaryButtonStyle, onClick: Message.ButtonClicked() },
          h,
        ),
        Button.view({ label: 'Dismiss', style: GhostButtonStyle }, h),
      ]),
    ]),
  )
  .pipe(Style.attach(CardStyle.style))

const fillSwatch = (
  slots: PageBuilders,
  h: HtmlBuilder<Message>,
  group: string,
  name: string,
): Html =>
  h.div(slots.swatch.attrs(), [
    h.div(slots.chip.attrs([h.Style({ background: `var(--fk-${group}-${name})` })]), []),
    h.p(slots.swatchName.attrs(), [`${name}`]),
  ])

const textSwatch = (slots: PageBuilders, h: HtmlBuilder<Message>, name: string): Html =>
  h.div(slots.swatch.attrs(), [
    h.div(
      slots.chip.attrs([
        h.Style({
          background: 'var(--fk-surface-base)',
          color: `var(--fk-text-${name})`,
          display: 'grid',
          placeItems: 'center',
          fontWeight: '600',
        }),
      ]),
      ['Aa'],
    ),
    h.p(slots.swatchName.attrs(), [`${name}`]),
  ])

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  const tokensCode = [
    'palette = Theme.oklch((',
    '  accent: { h: 222, c: 0.09, l: 52% },',
    '  surfaceSaturation: 0.003,',
    ')) with radius-factor 1.4',
    '',
    'Default     -> Button variant primary',
    'Secondary   -> tone neutral, solid',
    'Outline     -> tone neutral, outline',
    'Ghost       -> tone neutral, ghost',
    'Destructive -> tone danger, solid',
  ].join('\n')
  return {
    title: 'Design system · Foldkit Plus',
    body: h.main(
      slots.root.attrs([
        h.Style({
          '--fk-knob-accent-h': String(model.hue),
          colorScheme: model.scheme === 'system' ? 'light dark' : model.scheme,
          background: 'var(--fk-surface-base)',
          color: 'var(--fk-text-default)',
        }),
      ]),
      [
        h.header(slots.header.attrs(), [
          h.p(slots.eyebrow.attrs(), ['Foldkit Plus · Design system']),
          h.h1(slots.title.attrs(), ['Components in a shadcn skin']),
          h.p(slots.lede.attrs(), [
            'Every control below draws through a shipped foldkit-mixins-ui recipe over Theme.oklch tokens. The shadcn look is two decisions: near-zero surfaceSaturation with a larger radius-factor, and one recipe selection per intent.',
          ]),
        ]),
        h.div(slots.controls.attrs(), [
          h.div(slots.controlGroup.attrs(), [
            h.p(slots.controlLabel.attrs(), ['Accent hue (re-derives live)']),
            h.div(slots.row.attrs(), [
              ...hues.map(preset =>
                Button.view(
                  {
                    label: preset.label,
                    style: model.hue === preset.hue ? SecondaryButtonStyle : GhostButtonStyle,
                    onClick: Message.HueSelected({ hue: preset.hue }),
                  },
                  h,
                ),
              ),
            ]),
          ]),
          h.div(slots.controlGroup.attrs(), [
            h.p(slots.controlLabel.attrs(), ['Scheme']),
            h.div(slots.row.attrs(), [
              ...schemes.map(entry =>
                Button.view(
                  {
                    label: entry.label,
                    style: model.scheme === entry.scheme ? SecondaryButtonStyle : GhostButtonStyle,
                    onClick: Message.SchemeSelected({ scheme: entry.scheme }),
                  },
                  h,
                ),
              ),
            ]),
          ]),
        ]),
        h.nav(slots.nav.attrs([h.AriaLabel('Sections')]), [
          ...(
            [
              ['colors', 'Colors'],
              ['buttons', 'Buttons'],
              ['form', 'Form'],
              ['feedback', 'Feedback'],
              ['navigation', 'Navigation'],
              ['card', 'Card'],
              ['tokens', 'Tokens'],
            ] as const
          ).map(([id, label]) => h.a(slots.navLink.attrs([h.Href(`#${id}`)]), [label])),
        ]),
        h.section(slots.section.attrs([h.Id('colors')]), [
          h.h2(slots.sectionTitle.attrs(), ['Colors']),
          h.p(slots.sectionText.attrs(), [
            'Token families, as var(--fk-group-name) references. Picking a hue above rewrites one knob and every family follows.',
          ]),
          h.div(slots.swatchGrid.attrs(), [
            ...['bedrock', 'base', 'subtle', 'muted', 'default', 'overt'].map(name =>
              fillSwatch(slots, h, 'surface', name),
            ),
          ]),
          h.div(slots.swatchGrid.attrs(), [
            ...['subtle', 'default', 'overt', 'focus'].map(name =>
              fillSwatch(slots, h, 'outline', name),
            ),
            ...['overt', 'default', 'muted', 'subtle', 'link'].map(name =>
              textSwatch(slots, h, name),
            ),
          ]),
          ...['accent', 'secondary', 'tertiary', 'success', 'warning', 'error', 'info'].map(
            family =>
              h.div(slots.swatchGrid.attrs(), [
                ...['subtle', 'default', 'hover', 'outline', 'ink'].map(name =>
                  fillSwatch(slots, h, family, name),
                ),
              ]),
          ),
        ]),
        h.section(slots.section.attrs([h.Id('buttons')]), [
          h.h2(slots.sectionTitle.attrs(), ['Buttons']),
          h.p(slots.sectionText.attrs(), [
            `Default is primary ink, Secondary a neutral fill, then Outline, Ghost, and Destructive. Pressed ${model.clicks} ${model.clicks === 1 ? 'time' : 'times'} — every button dispatches.`,
          ]),
          h.div(slots.row.attrs(), [
            Button.view(
              { label: 'Default', style: PrimaryButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view(
              {
                label: 'Secondary',
                style: SecondaryButtonStyle,
                onClick: Message.ButtonClicked(),
              },
              h,
            ),
            Button.view(
              { label: 'Outline', style: OutlineButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view(
              { label: 'Ghost', style: GhostButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view(
              {
                label: 'Destructive',
                style: DestructiveButtonStyle,
                onClick: Message.ButtonClicked(),
              },
              h,
            ),
          ]),
          h.div(slots.row.attrs(), [
            Button.view(
              { label: 'Small', style: SmallButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view(
              { label: 'Large', style: LargeButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view({ label: 'Disabled', style: PrimaryButtonStyle, disabled: true }, h),
          ]),
        ]),
        h.section(slots.section.attrs([h.Id('form')]), [
          h.h2(slots.sectionTitle.attrs(), ['Form']),
          h.p(slots.sectionText.attrs(), [
            'Input, Textarea, Checkbox, and Switch, each a headless component resolved through its slot contract.',
          ]),
          Input.view(
            {
              id: 'name',
              value: model.name,
              onInput: (value: string) => Message.NameTyped({ value }),
              placeholder: 'Ada Lovelace',
              style: FieldStyle,
              described: true,
              draw: (resolved, h) =>
                h.div(
                  [],
                  [
                    h.label(resolved.label, ['Name']),
                    h.input(resolved.input),
                    h.span(resolved.description, [
                      `Hello${model.name === '' ? '' : `, ${model.name}`}.`,
                    ]),
                  ],
                ),
            },
            h,
          ),
          Input.view(
            {
              id: 'slug',
              value: 'design-system',
              placeholder: 'slug',
              style: FilledFieldStyle,
              draw: (resolved, h) =>
                h.div(
                  [],
                  [h.label(resolved.label, ['Slug (filled, read-only)']), h.input(resolved.input)],
                ),
            },
            h,
          ),
          Textarea.view(
            {
              id: 'bio',
              value: model.bio,
              onInput: (value: string) => Message.BioTyped({ value }),
              placeholder: 'What is this space for?',
              rows: 3,
              style: AreaStyle,
              draw: (resolved, h) =>
                h.div([], [h.label(resolved.label, ['Bio']), h.textarea(resolved.textarea)]),
            },
            h,
          ),
          UiCheckbox.view(
            {
              id: 'marketing',
              isChecked: model.marketing,
              onToggle: (value: boolean) => Message.MarketingToggled({ value }),
              toView: Checkbox.toView([CheckStyle.mixin], { h }, resolved =>
                h.div(slots.row.attrs(), [
                  h.button(resolved.checkbox, []),
                  h.label(resolved.label, ['Marketing emails']),
                  h.span(resolved.description, ['Product news, monthly.']),
                ]),
              ),
            },
            h,
          ),
          UiSwitch.view(
            {
              id: 'notifications',
              isChecked: model.notifications,
              onToggle: (value: boolean) => Message.NotificationsToggled({ value }),
              toView: Switch.toView([ToggleStyle.mixin], { h }, resolved =>
                h.div(slots.row.attrs(), [
                  h.button(resolved.button, []),
                  h.label(resolved.label, ['Email notifications']),
                  h.span(resolved.description, [
                    model.notifications ? 'On: digests on Monday.' : 'Off.',
                  ]),
                ]),
              ),
            },
            h,
          ),
        ]),
        h.section(slots.section.attrs([h.Id('feedback')]), [
          h.h2(slots.sectionTitle.attrs(), ['Feedback']),
          h.p(slots.sectionText.attrs(), [
            'One badge style serves every tone through data-state; the dialog panel draws in place.',
          ]),
          BadgesView(undefined, h),
          DialogPreview(undefined, h),
        ]),
        h.section(slots.section.attrs([h.Id('navigation')]), [
          h.h2(slots.sectionTitle.attrs(), ['Navigation']),
          h.p(slots.sectionText.attrs(), [
            'Tabs in line and pill variants, and a Segmented plan picker — all driven by this page\u2019s own tab state.',
          ]),
          LineTabsView(model.lineTab, h),
          PillTabsView(model.pillTab, h),
          PlanView(model.plan, h),
          h.p(slots.sectionText.attrs(), [
            `Showing ${model.lineTab}, ${model.pillTab} view, ${model.plan} plan.`,
          ]),
        ]),
        h.section(slots.section.attrs([h.Id('card')]), [
          h.h2(slots.sectionTitle.attrs(), ['Card']),
          h.p(slots.sectionText.attrs(), [
            'The shadcn card: base surface, hairline border, large radius, soft shadow.',
          ]),
          CardView(model.clicks, h),
        ]),
        h.section(slots.section.attrs([h.Id('tokens')]), [
          h.h2(slots.sectionTitle.attrs(), ['Tokens']),
          h.p(slots.sectionText.attrs(), [
            'The whole skin, as application code. No forked CSS: knobs plus selections.',
          ]),
          h.div(slots.code.attrs(), [tokensCode]),
        ]),
        h.p(slots.footer.attrs(), [
          'Recipes, tokens, and the full specimen page live in foldkit-mixins-ui. This demo is local state plus selections.',
        ]),
      ],
    ),
  }
}
