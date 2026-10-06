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
import * as UiDisclosure from '@foldkit/ui/disclosure'
import * as UiFieldset from '@foldkit/ui/fieldset'
import * as UiSelect from '@foldkit/ui/select'
import * as UiSwitch from '@foldkit/ui/switch'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import {
  Button,
  CalendarSlots,
  Checkbox,
  DialogSlots,
  Disclosure,
  Fieldset,
  HoverIntentSlots,
  Input,
  Patterns,
  PopoverSlots,
  RadioGroupSlots,
  SegmentedSlots,
  Select,
  SliderSlots,
  Switch,
  TabsSlots,
  Textarea,
  TooltipSlots,
} from 'foldkit-mixins-ui'
import {
  AreaStyle,
  BadgeSlots,
  CalendarStyle,
  CardSlots,
  CardStyle,
  CheckStyle,
  DestructiveButtonStyle,
  DialogPreviewStyle,
  DisclosureStyle,
  FieldStyle,
  FieldsetStyle,
  FilledFieldStyle,
  GhostButtonStyle,
  HoverCardStyle,
  IconSlots,
  IconStyle,
  InputGroupSlots,
  InputGroupStyle,
  LargeButtonStyle,
  LineTabsStyle,
  OutlineButtonStyle,
  PageSlots,
  PageStyle,
  PillTabsStyle,
  PlanStyle,
  PopoverStyle,
  PrimaryButtonStyle,
  RadioStyle,
  SecondaryButtonStyle,
  SelectStyle,
  SliderStyle,
  SmallButtonStyle,
  StatusStyle,
  ToggleStyle,
  TooltipStyle,
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

const Contact = Schema.Union([
  Schema.Literal('email'),
  Schema.Literal('phone'),
  Schema.Literal('none'),
])
type Contact = typeof Contact.Type

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
  country: Schema.String,
  detailsOpen: Schema.Boolean,
  contact: Contact,
  volume: Schema.Number,
  popoverOpen: Schema.Boolean,
  address: Schema.String,
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
  CountrySelected: { value: Schema.String },
  DetailsToggled: { value: Schema.Boolean },
  ContactSelected: { contact: Contact },
  VolumeStepped: { delta: Schema.Number },
  PopoverToggled: {},
  AddressTyped: { value: Schema.String },
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
  country: 'us',
  detailsOpen: false,
  contact: 'email',
  volume: 60,
  popoverOpen: false,
  address: 'about',
}

const clampVolume = (value: number): number => Math.min(100, Math.max(0, value))

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
    CountrySelected: ({ value }) => ({ model: modifyFields(model, { country: () => value }) }),
    DetailsToggled: ({ value }) => ({
      model: modifyFields(model, { detailsOpen: () => value }),
    }),
    ContactSelected: ({ contact }) => ({ model: modifyFields(model, { contact: () => contact }) }),
    VolumeStepped: ({ delta }) => ({
      model: modifyFields(model, { volume: volume => clampVolume(volume + delta) }),
    }),
    PopoverToggled: () => ({ model: modifyFields(model, { popoverOpen: open => !open }) }),
    AddressTyped: ({ value }) => ({ model: modifyFields(model, { address: () => value }) }),
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

const countries: ReadonlyArray<readonly [value: string, label: string]> = [
  ['us', 'United States'],
  ['ca', 'Canada'],
  ['gb', 'United Kingdom'],
  ['au', 'Australia'],
]

const contacts: ReadonlyArray<{ readonly value: Contact; readonly label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'none', label: 'None' },
]

const RadioPreview = SlotView.forMessages<Message>()
  .define(RadioGroupSlots, (active: Contact, slots, h) =>
    h.div(slots.group.attrs([h.Role('radiogroup'), h.AriaLabel('Preferred contact')]), [
      ...contacts.map(contact =>
        h.button(
          slots.option.attrs([
            h.Type('button'),
            h.Role('radio'),
            h.AriaSelected(active === contact.value),
            h.OnClick(Message.ContactSelected({ contact: contact.value })),
          ]),
          [contact.label],
        ),
      ),
    ]),
  )
  .pipe(Style.attach(RadioStyle))

const SliderPreview = SlotView.forMessages<Message>()
  .define(SliderSlots, (volume: number, slots, h) =>
    h.div(slots.root.attrs(), [
      h.p(slots.label.attrs(), [`Volume: ${volume}`]),
      h.div(slots.track.attrs(), [
        h.div(slots.filledTrack.attrs([h.Style({ inlineSize: `${volume}%` })]), []),
        h.div(slots.thumb.attrs([h.Style({ insetInlineStart: `${volume}%` })]), []),
      ]),
      h.div(
        [],
        [
          Button.view(
            { label: '−', style: GhostButtonStyle, onClick: Message.VolumeStepped({ delta: -10 }) },
            h,
          ),
          Button.view(
            { label: '+', style: GhostButtonStyle, onClick: Message.VolumeStepped({ delta: 10 }) },
            h,
          ),
        ],
      ),
    ]),
  )
  .pipe(Style.attach(SliderStyle))

const weekDays: ReadonlyArray<string> = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const monthDays: ReadonlyArray<number> = [12, 13, 14, 15, 16, 17, 18]

const CalendarPreview = SlotView.forMessages<Message>()
  .define(CalendarSlots, (selected: number, slots, h) =>
    h.div(slots.root.attrs(), [
      h.div(slots.grid.attrs([h.Role('grid'), h.AriaLabel('October 2026')]), [
        h.div(slots.headerRow.attrs([h.Role('row')]), [
          ...weekDays.map(day => h.span(slots.columnHeader.attrs([h.Role('columnheader')]), [day])),
        ]),
        h.div(slots.weekRow.attrs([h.Role('row')]), [
          ...monthDays.map(day =>
            h.span(slots.dayCell.attrs([h.Role('gridcell')]), [
              h.button(
                slots.dayButton.attrs([
                  h.Type('button'),
                  h.DataAttribute('selected', day === selected ? 'true' : 'false'),
                  h.AriaLabel(`October ${day}`),
                ]),
                [String(day)],
              ),
            ]),
          ),
        ]),
      ]),
    ]),
  )
  .pipe(Style.attach(CalendarStyle))

const PopoverPreview = SlotView.forMessages<Message>()
  .define(PopoverSlots, (open: boolean, slots, h) =>
    h.div(
      [],
      [
        h.button(
          slots.button.attrs([
            h.Type('button'),
            h.AriaExpanded(open),
            h.OnClick(Message.PopoverToggled()),
          ]),
          [open ? 'Close details' : 'Show details'],
        ),
        open
          ? h.div(slots.panel.attrs(), [
              'A popover panel, drawn in place. The real component anchors this against its trigger and closes on escape or outside press.',
            ])
          : h.empty,
      ],
    ),
  )
  .pipe(Style.attach(PopoverStyle))

const TooltipPreview = SlotView.forMessages<Message>()
  .define(TooltipSlots, (_input: unknown, slots, h) =>
    h.div(
      [],
      [
        h.span(slots.trigger.attrs(), ['Hover or focus me']),
        h.span(slots.panel.attrs([h.Role('tooltip')]), ['A helpful hint']),
      ],
    ),
  )
  .pipe(Style.attach(TooltipStyle))

const HoverPreview = SlotView.forMessages<Message>()
  .define(HoverIntentSlots, (_input: unknown, slots, h) =>
    h.div(
      [],
      [
        h.span(slots.trigger.attrs(), ['A team member']),
        h.div(slots.panel.attrs(), [
          'A hover card with open and close delays, so moving between trigger and panel does not flicker. Drawn in place here.',
        ]),
      ],
    ),
  )
  .pipe(Style.attach(HoverCardStyle))

const InputGroupDemo = SlotView.forMessages<Message>()
  .define(InputGroupSlots, (value: string, slots, h) =>
    h.div(
      [],
      [
        h.div(slots.group.attrs(), [
          h.span(slots.affix.attrs(), ['/']),
          h.input(
            slots.control.attrs([
              h.Type('text'),
              h.Value(value),
              h.AriaLabel('Site path'),
              h.OnInput((typed: string) => Message.AddressTyped({ value: typed })),
            ]),
          ),
        ]),
      ],
    ),
  )
  .pipe(Style.attach(InputGroupStyle.style))

const IconsDemo = SlotView.forMessages<Message>()
  .define(IconSlots, (_input: unknown, slots, h) =>
    h.div(slots.row.attrs(), [
      h.span(slots.chip.attrs([h.DataAttribute('icon', 'dot')]), ['Status']),
      h.span(slots.chip.attrs([h.DataAttribute('icon', 'star')]), ['Featured']),
    ]),
  )
  .pipe(Style.attach(IconStyle.style))

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
              ['choice', 'Choice'],
              ['feedback', 'Feedback'],
              ['overlays', 'Overlays'],
              ['navigation', 'Navigation'],
              ['calendar', 'Calendar'],
              ['card', 'Card'],
              ['utilities', 'Utilities'],
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
        h.section(slots.section.attrs([h.Id('choice')]), [
          h.h2(slots.sectionTitle.attrs(), ['Choice']),
          h.p(slots.sectionText.attrs(), [
            'One value from many: a native Select, radio pills, a slider preview, and a Disclosure — each through its slot contract.',
          ]),
          UiSelect.view(
            {
              id: 'country',
              value: model.country,
              onChange: (value: string) => Message.CountrySelected({ value }),
              hasDescription: true,
              toView: Select.toView([SelectStyle.mixin], { h }, resolved =>
                h.div(
                  [],
                  [
                    h.label(resolved.label, ['Country']),
                    h.select(
                      resolved.select,
                      countries.map(([value, label]) => h.option([h.Value(value)], [label])),
                    ),
                    h.span(resolved.description, ['Where you currently reside.']),
                  ],
                ),
              ),
            },
            h,
          ),
          UiDisclosure.view(
            {
              id: 'details',
              isOpen: model.detailsOpen,
              onToggle: (value: boolean) => Message.DetailsToggled({ value }),
              toView: Disclosure.toView([DisclosureStyle.mixin], { h }, resolved =>
                h.div(
                  [],
                  [
                    h.button(resolved.button, [
                      model.detailsOpen ? 'Hide project details' : 'Show project details',
                    ]),
                    model.detailsOpen
                      ? h.div(resolved.panel, [
                          'Six people, three open milestones, and one demo that keeps growing.',
                        ])
                      : h.empty,
                  ],
                ),
              ),
            },
            h,
          ),
          UiFieldset.view(
            {
              id: 'contact-prefs',
              hasDescription: true,
              toView: Fieldset.toView([FieldsetStyle.mixin], { h }, resolved =>
                h.fieldset(resolved.fieldset, [
                  h.legend(resolved.legend, ['Preferred contact']),
                  RadioPreview(model.contact, h),
                  h.span(resolved.description, [
                    `Currently ${model.contact}. The group is a fieldset, the options radio pills.`,
                  ]),
                ]),
              ),
            },
            h,
          ),
          SliderPreview(model.volume, h),
        ]),
        h.section(slots.section.attrs([h.Id('feedback')]), [
          h.h2(slots.sectionTitle.attrs(), ['Feedback']),
          h.p(slots.sectionText.attrs(), [
            'One badge style serves every tone through data-state; the dialog panel draws in place.',
          ]),
          BadgesView(undefined, h),
          DialogPreview(undefined, h),
        ]),
        h.section(slots.section.attrs([h.Id('overlays')]), [
          h.h2(slots.sectionTitle.attrs(), ['Overlays']),
          h.p(slots.sectionText.attrs(), [
            'Floating UI drawn in place: a popover with real open state, a tooltip pill, and a hover card. The live components anchor against their triggers and dismiss on escape.',
          ]),
          PopoverPreview(model.popoverOpen, h),
          TooltipPreview(undefined, h),
          HoverPreview(undefined, h),
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
        h.section(slots.section.attrs([h.Id('calendar')]), [
          h.h2(slots.sectionTitle.attrs(), ['Calendar']),
          h.p(slots.sectionText.attrs(), [
            'A month grid preview through the Calendar slots; the 15th is selected. The live component pages months and years as a Submodel.',
          ]),
          CalendarPreview(15, h),
        ]),
        h.section(slots.section.attrs([h.Id('card')]), [
          h.h2(slots.sectionTitle.attrs(), ['Card']),
          h.p(slots.sectionText.attrs(), [
            'The shadcn card: base surface, hairline border, large radius, soft shadow.',
          ]),
          CardView(model.clicks, h),
        ]),
        h.section(slots.section.attrs([h.Id('utilities')]), [
          h.h2(slots.sectionTitle.attrs(), ['Utilities']),
          h.p(slots.sectionText.attrs(), [
            'Mechanisms, not components: an InputGroup address field, attribute-dispatched icons with coarse-pointer touch targets, and the accessibility pattern catalog every adapter is gated against.',
          ]),
          InputGroupDemo(model.address, h),
          h.p(slots.sectionText.attrs(), [`Previewing “/${model.address}”.`]),
          IconsDemo(undefined, h),
          h.div(slots.code.attrs(), [
            Patterns.catalog
              .map(
                entry =>
                  `${entry.name} (${entry.tier}): roles [${entry.roles.join(', ')}] floor [${entry.floor.join(', ') || 'none'}]`,
              )
              .join('\n'),
          ]),
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
