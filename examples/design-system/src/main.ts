/**
 * An interactive showcase of the `foldkit-mixins` + `foldkit-mixins-ui`
 * design system, styled to read like shadcn: zinc-like surfaces, hairline
 * borders, roomy corners, black primary buttons, and a red destructive tone.
 *
 * This is the part the page loads at start: the theme studio, its specimen and
 * the static sections. The catalog's other sections are islands
 * (`sections/*.ts`, `islands.ts`), each its own small runtime that loads when
 * its section nears the window.
 */
import { Effect, Equal, Option, Schema } from 'effect'
import { Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import * as Command from 'foldkit/command'
import * as Render from 'foldkit/render'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { SlotView, type SlotBuilders } from 'foldkit-mixins'
import { chooseScheme } from 'foldkit-mixins/theme'
import {
  Alert,
  AppShell,
  Avatar,
  Button,
  Input,
  Kbd,
  Separator,
  Sidebar,
  Skeleton,
  Spinner,
} from 'foldkit-mixins-ui'
import {
  AlertWarningStyle,
  AvatarLgStyle,
  AvatarMdStyle,
  AvatarSmStyle,
  DestructiveButtonStyle,
  FieldStyle,
  KbdStyle,
  OutlineButtonStyle,
  PageStyle,
  CascadeStyle,
  TokenStyle,
  PrimaryButtonStyle,
  SecondaryButtonStyle,
  SeparatorStyle,
  SkeletonCircleStyle,
  SkeletonStyle,
  SpinnerStyle,
  AppShellStyle,
  SidebarStyle,
  SidebarSheetStyle,
} from './style.js'
import { CascadeSlots, PageSlots, TokenSlots } from './slots.js'
import { studioPanel, titled, type Direction } from './studio.js'
import { ContrastSlots, StudioSlots } from './slots.js'
import { ContrastStyle, StudioStyle } from './style.js'
import { initialTheme, tokenGroups } from './themeData.js'
import { chooseTheme } from 'foldkit-mixins/theme/runtime'
import { foldsFor } from './fold.js'
import { measure, pairs, gradeOf, probeId } from './contrast.js'
import { bootIslands } from './islands.js'
import { BadgesView, neverH } from './shared.js'
import { ThemeName, looks } from './looks.js'
import { TweakName, Tweaks, hasTweaks, noTweaks, tweaksCss, withTweak } from './tweaks.js'

const Scheme = Schema.Union([
  Schema.Literal('system'),
  Schema.Literal('light'),
  Schema.Literal('dark'),
])

type Scheme = typeof Scheme.Type

// --- model -------------------------------------------------------------------

export const Model = Schema.Struct({
  theme: ThemeName,
  scheme: Scheme,
  tweaks: Tweaks,
  dir: Schema.Literals(['ltr', 'rtl']),
  status: Schema.String,
  clicks: Schema.Number,
  sidebar: Sidebar.Model,
  /** The measured contrast ratio of each palette pair, none until read. */
  contrast: Schema.Array(Schema.OptionFromNullOr(Schema.Number)),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ThemePicked: { name: ThemeName },
  SchemeSelected: { scheme: Scheme },
  TweakChanged: { tweak: TweakName, value: Schema.Number },
  TweaksReset: {},
  DirectionSelected: { dir: Schema.Literals(['ltr', 'rtl']) },
  ThemeChangedElsewhere: { name: ThemeName },
  SchemeChangedElsewhere: { scheme: Scheme },
  Applied: {},
  ButtonClicked: {},
  GotSidebar: { message: Sidebar.Message },
  Contrasted: { ratios: Schema.Array(Schema.OptionFromNullOr(Schema.Number)) },
})
export type Message = typeof Message.Type

/** The initial Model: the theme and scheme the head script showed. */
export const initModel = (
  shown: { readonly theme: ThemeName; readonly scheme: Scheme } = {
    theme: initialTheme,
    scheme: 'system',
  },
): Model => ({
  theme: shown.theme,
  scheme: shown.scheme,
  tweaks: noTweaks,
  dir: 'ltr',
  status: '',
  clicks: 0,
  sidebar: Sidebar.init({ id: 'sections', rows: [] }),
  contrast: pairs.map(() => Option.none()),
})

/** Reads the contrast of every palette pair once the page has drawn the theme it shows. */
const MeasureContrast = Command.define('MeasureContrast', {
  messages: [Message.Contrasted],
  execute: Render.afterCommit.pipe(Effect.map(() => Message.Contrasted({ ratios: measure() }))),
})

/** Boots the islands once the first frame is drawn: their placeholders exist then. */
const BootIslands = Command.define('BootIslands', {
  messages: [Message.Applied],
  execute: Render.afterCommit.pipe(
    Effect.map(() => {
      bootIslands()
      return Message.Applied()
    }),
  ),
})

/** The first Model and the Command that boots the islands. */
export const init = (shown?: { readonly theme: ThemeName; readonly scheme: Scheme }) => ({
  model: initModel(shown),
  commands: [BootIslands()],
})

/** Shows the theme on the root and keeps it for the next visit and the other tabs. */
const ApplyTheme = Command.define('ApplyTheme', {
  args: { name: ThemeName },
  messages: [Message.Applied],
  execute: ({ name }) => chooseTheme(looks, name).pipe(Effect.as(Message.Applied())),
})

const ApplyScheme = Command.define('ApplyScheme', {
  args: { scheme: Scheme },
  messages: [Message.Applied],
  execute: ({ scheme }) => chooseScheme(scheme).pipe(Effect.as(Message.Applied())),
})

const ApplyDirection = Command.define('ApplyDirection', {
  args: { dir: Schema.Literals(['ltr', 'rtl']) },
  messages: [Message.Applied],
  execute: ({ dir }) =>
    Effect.sync(() => {
      document.documentElement.dir = dir
    }).pipe(Effect.as(Message.Applied())),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    ThemePicked: ({ name }) =>
      name === model.theme && !hasTweaks(model.tweaks)
        ? { model }
        : {
            model: modifyFields(model, {
              theme: () => name,
              tweaks: () => noTweaks,
              status: () => `${titled(name)} theme applied`,
            }),
            commands: [ApplyTheme({ name })],
          },
    SchemeSelected: ({ scheme }) =>
      scheme === model.scheme
        ? { model }
        : {
            model: modifyFields(model, {
              scheme: () => scheme,
              status: () => `${titled(scheme)} colour scheme`,
            }),
            commands: [ApplyScheme({ scheme })],
          },
    TweakChanged: ({ tweak, value }) => {
      const tweaks = withTweak(model.tweaks, tweak, value)
      return tweaks === model.tweaks
        ? { model }
        : { model: modifyFields(model, { tweaks: () => tweaks }), commands: [MeasureContrast()] }
    },
    TweaksReset: () =>
      hasTweaks(model.tweaks)
        ? {
            model: modifyFields(model, { tweaks: () => noTweaks, status: () => 'Tweaks reset' }),
          }
        : { model },
    DirectionSelected: ({ dir }) =>
      dir === model.dir
        ? { model }
        : {
            model: modifyFields(model, {
              dir: () => dir,
              status: () => `Direction ${dir === 'rtl' ? 'right to left' : 'left to right'}`,
            }),
            commands: [ApplyDirection({ dir })],
          },
    ThemeChangedElsewhere: ({ name }) =>
      name === model.theme
        ? { model }
        : {
            model: modifyFields(model, {
              theme: () => name,
              tweaks: () => noTweaks,
              status: () => `${titled(name)} theme chosen in another tab`,
            }),
            commands: [ApplyTheme({ name })],
          },
    SchemeChangedElsewhere: ({ scheme }) =>
      scheme === model.scheme
        ? { model }
        : {
            model: modifyFields(model, {
              scheme: () => scheme,
              status: () => `${titled(scheme)} colour scheme chosen in another tab`,
            }),
            commands: [ApplyScheme({ scheme })],
          },
    // Every theme, scheme and direction is shown by a Command that answers `Applied`: only then is the page drawn in it.
    Applied: () => ({ model, commands: [MeasureContrast()] }),
    Contrasted: ({ ratios }) =>
      ratios.length === model.contrast.length &&
      ratios.every((ratio, index) => Equal.equals(ratio, model.contrast[index]))
        ? { model }
        : { model: modifyFields(model, { contrast: () => ratios }) },
    ButtonClicked: () => ({ model: modifyFields(model, { clicks: clicks => clicks + 1 }) }),
    GotSidebar: ({ message }) => foldSidebar(model, message),
  })

const own = foldsFor<Model, Message>()

const foldSidebar = Update.foldChild({
  ...own('sidebar', Message.GotSidebar),
  update: Sidebar.update,
})

/** A hermetic picture tile: the avatar demo loads no network images. Hex fills
 * stay out: `%23` will not load as an image (nor will a bare `#`, which
 * starts a fragment), so the tile is a named color. */
const avatarTile =
  'data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2764%27 height=%2764%27 viewBox=%270%200%2064%2064%27><rect width=%2764%27 height=%2764%27 fill=%27slategray%27/></svg>'

/** What the knobs act on, at once: states of the controls that carry them, not a catalog. */
const Specimen = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(StudioSlots, [StudioStyle.style.mixin], { input: model, h })
  return h.div(slots.specimen.attrs(), [
    h.p(slots.specimenLabel.attrs(), [
      'Buttons: rest and disabled. Hover, press or Tab to the rest.',
    ]),
    h.div(slots.specimenRow.attrs(), [
      Button.view(
        { label: 'Default', style: PrimaryButtonStyle, onClick: Message.ButtonClicked() },
        h,
      ),
      Button.view(
        { label: 'Secondary', style: SecondaryButtonStyle, onClick: Message.ButtonClicked() },
        h,
      ),
      Button.view(
        { label: 'Outline', style: OutlineButtonStyle, onClick: Message.ButtonClicked() },
        h,
      ),
      Button.view(
        { label: 'Destructive', style: DestructiveButtonStyle, onClick: Message.ButtonClicked() },
        h,
      ),
      Button.view({ label: 'Disabled', style: PrimaryButtonStyle, disabled: true }, h),
    ]),
    Input.view(
      {
        id: 'specimen-email',
        value: 'ada@',
        invalid: true,
        style: FieldStyle,
        described: true,
        draw: (resolved, h) =>
          h.div(
            [],
            [
              h.label(resolved.label, ['Email, invalid']),
              h.input(resolved.input),
              h.span(resolved.description, ['Add the domain after the @.']),
            ],
          ),
      },
      h,
    ),
    BadgesView(undefined, neverH),
    Alert.view(
      {
        layout: 'inline',
        title: 'Storage almost full',
        description: 'Only 2 GB left on this project.',
        icon: h.span([h.AriaHidden(true)], ['!']),
        style: AlertWarningStyle,
      },
      neverH,
    ),
    h.div(slots.specimenRow.attrs(), [
      Spinner.view({ label: 'Loading projects', style: SpinnerStyle }, neverH),
      Skeleton.view({ label: 'Loading title', style: SkeletonStyle }, neverH),
    ]),
  ])
}

/** A scale from the theme, one row per token: its name, a bar the token itself sizes, and its expression. */
const TokenTable = (kind: 'space' | 'radius', h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(TokenSlots, [TokenStyle.style.mixin], { input: undefined, h })
  return h.div(
    slots.table.attrs(),
    tokenGroups[kind].map(([name, expression]) =>
      h.div(slots.row.attrs([h.Key(`${kind}-${name}`)]), [
        h.p(slots.name.attrs(), [name]),
        h.div(
          slots.bar.attrs([
            h.AriaHidden(true),
            h.Style(
              kind === 'space'
                ? { inlineSize: `var(--fk-space-${name})` }
                : {
                    inlineSize: '2.5rem',
                    blockSize: '2.5rem',
                    borderRadius: `var(--fk-radius-${name})`,
                  },
            ),
          ]),
          [],
        ),
        h.p(slots.expression.attrs(), [expression]),
      ]),
    ),
  )
}

/** Four boxes setting one property from four places: the later layer wins, and `Style.inline` beats every layer. */
const CascadeDemo = (h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(CascadeSlots, [CascadeStyle.style.mixin], {
    input: undefined,
    h,
  })
  return h.div(slots.row.attrs(), [
    h.div(slots.base.attrs(), ['components layer']),
    h.div(slots.variant.attrs(), ['+ variants layer']),
    h.div(slots.app.attrs(), ['+ app layer']),
    h.div(slots.inline.attrs(), ['+ Style.inline']),
  ])
}

/** The knobs the reader tweaked, written on `:root`; the theme's own are in the sheet. */
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

/** The page's sections, in order: the sidebar links to each by its id. */
const sections = [
  ['theme', 'Theme'],
  ['colors', 'Colors'],
  ['buttons', 'Buttons'],
  ['form', 'Form'],
  ['choice', 'Choice'],
  ['menu', 'Menu'],
  ['feedback', 'Feedback'],
  ['overlays', 'Overlays'],
  ['navigation', 'Navigation'],
  ['calendar', 'Date'],
  ['card', 'Card'],
  ['display', 'Display'],
  ['collections', 'Collections'],
  ['utilities', 'Utilities'],
  ['tokens', 'Tokens'],
  ['cascade', 'Cascade'],
] as const

const tokenRef = ([group, name]: readonly [string, string]): string => `var(--fk-${group}-${name})`

/** The contrast of the palette the theme derives, as the page paints it now: see `contrast.ts`. */
const ContrastTable = (model: Pick<Model, 'contrast'>, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(ContrastSlots, [ContrastStyle.style.mixin], {
    input: undefined,
    h,
  })
  return h.div(
    slots.table.attrs([h.AriaLabel('Contrast of the derived palette')]),
    pairs.map((pair, index) => {
      const measured = model.contrast[index] ?? Option.none()
      return h.div(slots.row.attrs([h.Key(`contrast-${index}`)]), [
        h.div(
          slots.sample.attrs([
            h.Id(probeId(index)),
            h.AriaHidden(true),
            h.Style({ color: tokenRef(pair.foreground), background: tokenRef(pair.background) }),
          ]),
          ['Aa'],
        ),
        h.p(slots.label.attrs(), [pair.label]),
        h.p(slots.ratio.attrs(), [
          Option.match(measured, {
            onNone: () => 'measuring',
            onSome: ratio => `${ratio.toFixed(2)} : 1`,
          }),
        ]),
        Option.match(measured, {
          onNone: () => h.span([], []),
          onSome: ratio => {
            const grade = gradeOf(ratio)
            return h.span(
              slots.grade.attrs([
                h.DataAttribute(
                  'state',
                  grade === 'Fail' ? 'bad' : grade === 'Large' ? 'warn' : 'ok',
                ),
              ]),
              [grade],
            )
          },
        }),
      ])
    }),
  )
}

type PageBuilders = SlotBuilders<typeof PageSlots, Message>

/** Where an island draws: its heading is here, so the sidebar link and the page's length are there at start. */
const IslandSlot = (
  slots: PageBuilders,
  h: HtmlBuilder<Message>,
  id: string,
  title: string,
): Html =>
  h.section(slots.section.attrs([h.Id(id)]), [
    h.h2(slots.sectionTitle.attrs(), [title]),
    h.div(slots.island.attrs([h.Id(`${id}-island`)]), []),
  ])

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  const rootOverride = tweaksCss(model.tweaks)
  const studioSlots = SlotView.buildersFor(StudioSlots, [StudioStyle.style.mixin], {
    input: model,
    h,
  })
  const tokensCode = [
    "Themes.make({ shadcn, compact, soft, hard }, { initial: 'shadcn' })",
    'AppStyle.make({ themes })',
    '',
    'Default     -> Button variant primary',
    'Secondary   -> tone neutral, solid',
    'Outline     -> tone neutral, outline',
    'Ghost       -> tone neutral, ghost',
    'Destructive -> tone danger, solid',
  ].join('\n')
  return {
    title: 'Design system · Foldkit Plus',
    body: AppShell.view(
      {
        title: 'Design system',
        side: Sidebar.view(
          {
            model: model.sidebar,
            onMessage: message => Message.GotSidebar({ message }),
            label: 'Sections',
            groups: [
              {
                id: 'sections',
                rows: sections.map(([id, label]) => ({ id, label, href: `#${id}` })),
              },
            ],
            style: SidebarStyle,
            sheet: [SidebarSheetStyle.mixin],
          },
          h,
        ),
        style: AppShellStyle,
      },
      [
        h.style([], [rootOverride]),
        h.div(slots.root.attrs(), [
          h.header(slots.header.attrs(), [
            h.p(slots.eyebrow.attrs(), ['Foldkit Plus · Design system']),
            h.h1(slots.title.attrs(), ['Components in a shadcn skin']),
            h.p(slots.lede.attrs(), [
              'Every control below draws through a shipped foldkit-mixins-ui recipe over the shipped tokens. The shadcn look is two decisions: near-zero surface saturation with a larger radius, and one recipe selection per intent.',
            ]),
          ]),
          h.section(slots.section.attrs([h.Id('theme')]), [
            h.h2(slots.sectionTitle.attrs(), ['Theme']),
            h.p(slots.sectionText.attrs(), [
              'A theme is a handful of knob values. Pick one, or move a knob over it, and every control on the page follows: spacing, corners, accent, shadow, text size and motion all derive from the same numbers.',
            ]),
            h.div(studioSlots.studio.attrs(), [
              studioPanel(
                model,
                {
                  theme: name => Message.ThemePicked({ name }),
                  scheme: scheme => Message.SchemeSelected({ scheme }),
                  dir: (dir: Direction) => Message.DirectionSelected({ dir }),
                  tweak: (tweak, value) => Message.TweakChanged({ tweak, value }),
                  reset: Message.TweaksReset(),
                },
                h,
              ),
              Specimen(model, h),
            ]),
          ]),
          h.section(slots.section.attrs([h.Id('colors')]), [
            h.h2(slots.sectionTitle.attrs(), ['Colors']),
            h.p(slots.sectionText.attrs(), [
              'Token families, as var(--fk-group-name) references. The hue slider rewrites one knob and every family follows.',
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
            h.p(slots.controlLabel.attrs(), [
              'Contrast of the derived palette, measured as painted (WCAG 2: AA is 4.5, large text 3)',
            ]),
            ContrastTable(model, h),
          ]),
          IslandSlot(slots, h, 'buttons', 'Buttons'),
          IslandSlot(slots, h, 'form', 'Form'),
          IslandSlot(slots, h, 'choice', 'Choice'),
          IslandSlot(slots, h, 'feedback', 'Feedback'),
          IslandSlot(slots, h, 'overlays', 'Menu and overlays'),
          IslandSlot(slots, h, 'navigation', 'Navigation'),
          IslandSlot(slots, h, 'calendar', 'Date'),
          h.section(slots.section.attrs([h.Id('display')]), [
            h.h2(slots.sectionTitle.attrs(), ['Display']),
            h.p(slots.sectionText.attrs(), [
              'Status at a glance, each in one view call: who is here, which keys to press, rules between things, placeholders while content loads, and a spinner that announces itself.',
            ]),
            h.div(slots.row.attrs(), [
              Avatar.view({ name: 'Ada Lovelace', src: avatarTile, style: AvatarSmStyle }, neverH),
              Avatar.view({ name: 'Grace Hopper', src: avatarTile, style: AvatarMdStyle }, neverH),
              Avatar.view({ name: 'Alan Turing', src: avatarTile, style: AvatarLgStyle }, neverH),
            ]),
            h.p(slots.sectionText.attrs(), [
              'Press ',
              Kbd.view({ key: '⌘', style: KbdStyle }, neverH),
              Kbd.view({ key: 'K', style: KbdStyle }, neverH),
              ' to search.',
            ]),
            h.p(slots.sectionText.attrs(), ['Shipped']),
            Separator.view({ style: SeparatorStyle }, neverH),
            h.p(slots.sectionText.attrs(), ['Archived']),
            h.div(slots.row.attrs(), [
              h.span([], ['Draft']),
              Separator.view({ orientation: 'vertical', style: SeparatorStyle }, neverH),
              h.span([], ['Live']),
            ]),
            Skeleton.view({ label: 'Loading title', style: SkeletonStyle }, neverH),
            Skeleton.view({ label: 'Loading body', style: SkeletonStyle }, neverH),
            Skeleton.view({ label: 'Loading avatar', style: SkeletonCircleStyle }, neverH),
            h.div(slots.row.attrs(), [
              Spinner.view({ label: 'Loading projects', style: SpinnerStyle }, neverH),
              h.span([], ['Loading projects']),
            ]),
          ]),
          IslandSlot(slots, h, 'collections', 'Collections'),
          IslandSlot(slots, h, 'utilities', 'Utilities'),
          h.section(slots.section.attrs([h.Id('tokens')]), [
            h.h2(slots.sectionTitle.attrs(), ['Tokens']),
            h.p(slots.sectionText.attrs(), [
              'The whole skin, as application code. No forked CSS: knobs plus selections. The scales below are read from the theme, not typed here: each bar is sized by its own token, so a knob moves it.',
            ]),
            h.p(slots.controlLabel.attrs(), ['Space (density multiplies it)']),
            TokenTable('space', h),
            h.p(slots.controlLabel.attrs(), ['Radius (radius factor multiplies it)']),
            TokenTable('radius', h),
            h.div(slots.code.attrs(), [tokensCode]),
          ]),
          h.section(slots.section.attrs([h.Id('cascade')]), [
            h.h2(slots.sectionTitle.attrs(), ['Cascade']),
            h.p(slots.sectionText.attrs(), [
              'Each box sets background from one more place than the last. Components, variants and app are layers, so the later layer wins whatever the order in the source; Style.inline sits outside every layer and wins over all of them, which is why only values no theme may touch belong there.',
            ]),
            CascadeDemo(h),
          ]),
          h.p(slots.footer.attrs(), [
            'Recipes, tokens, and the full specimen page live in foldkit-mixins-ui. This demo is local state plus selections.',
          ]),
        ]),
      ],
      h,
    ),
  }
}
