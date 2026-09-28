import * as UiButton from '@foldkit/ui/button'
import * as UiSwitch from '@foldkit/ui/switch'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, RadioGroup as RadioGroupAdapter, Switch } from 'foldkit-mixins-ui'

import { Listbox, RadioGroup } from '@foldkit/ui'

import { EMPTY_COLOR, GRID_SIZE_STRINGS } from '../constant.js'
import { Message } from '../message.js'
import { type MirrorMode, type PaletteIndex, type Tool } from '../model.js'
import { PALETTE_THEMES, type PaletteTheme, currentPaletteTheme } from '../palette.js'
import {
  FullWidthButtonStyle,
  MirrorSwitchStyle,
  SizeOptionStyle,
  SwatchStyle,
  ToolOptionStyle,
  ToolbarSlots,
  ToolbarStyle,
} from '../style.js'

const TOOLS: ReadonlyArray<Tool> = ['Brush', 'Fill', 'Eraser']

export const TOOL_RADIO_GROUP_ID = 'tool-picker'
export const GRID_SIZE_RADIO_GROUP_ID = 'grid-size-picker'
export const PALETTE_RADIO_GROUP_ID = 'palette-picker'
const MIRROR_HORIZONTAL_SWITCH_ID = 'mirror-horizontal'
const MIRROR_VERTICAL_SWITCH_ID = 'mirror-vertical'

export const ThemeListbox = Listbox.create<string>()

export const ToolRadioGroup: RadioGroup.Bundle<Tool> = RadioGroup.create<Tool>()
export const GridSizeRadioGroup: RadioGroup.Bundle = RadioGroup.create()
export const PaletteRadioGroup: RadioGroup.Bundle = RadioGroup.create()

const TOOL_SHORTCUTS: Record<Tool, string> = {
  Brush: 'B',
  Fill: 'F',
  Eraser: 'E',
}

const THEME_INDEX_STRINGS = Array.makeBy(PALETTE_THEMES.length, String)

const THEME_LISTBOX_ANCHOR: Listbox.AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
}

type Slots = SlotBuilders<typeof ToolbarSlots, Message>

const define = SlotView.forMessages<Message>().define

const sectionLabel = (text: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.label.attrs(), [text])

const trashIcon = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.svg(
    slots.icon.attrs([
      h.AriaHidden(true),
      h.Xmlns('http://www.w3.org/2000/svg'),
      h.Fill('none'),
      h.ViewBox('0 0 24 24'),
      h.StrokeWidth('1.5'),
      h.Stroke('currentColor'),
    ]),
    [
      h.path(
        slots.iconPath.attrs([
          h.StrokeLinecap('round'),
          h.StrokeLinejoin('round'),
          h.D(
            'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
          ),
        ]),
      ),
    ],
  )

const chevronDownIcon = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.svg(
    slots.chevron.attrs([
      h.AriaHidden(true),
      h.Xmlns('http://www.w3.org/2000/svg'),
      h.Fill('none'),
      h.ViewBox('0 0 24 24'),
      h.StrokeWidth('1.5'),
      h.Stroke('currentColor'),
    ]),
    [
      h.path(
        slots.iconPath.attrs([
          h.StrokeLinecap('round'),
          h.StrokeLinejoin('round'),
          h.D('M19.5 8.25l-7.5 7.5-7.5-7.5'),
        ]),
      ),
    ],
  )

// SUBMODEL CONTENT

// What the Submodels below draw, each a view of its own, so a test can draw
// it without a runtime: `h.submodel` needs one.

/** The tool radio group's options. */
export const ToolOptions: SlotView.SlotView<
  typeof ToolbarSlots,
  RadioGroup.RenderInfo<Tool>,
  Message
> = define(ToolbarSlots, (render: RadioGroup.RenderInfo<Tool>, slots, h) => {
  const { group, options } = RadioGroupAdapter.resolve<Tool, undefined, Message>(
    render,
    [ToolOptionStyle.mixin],
    { input: undefined, h },
  )
  return h.div(
    slots.toolGroup.attrs(group),
    options.map(option =>
      h.button(option.option, [
        h.span(slots.buttonText.attrs(), [option.value]),
        h.span(slots.shortcut.attrs(), [TOOL_SHORTCUTS[option.value]]),
      ]),
    ),
  )
}).pipe(Style.attach(ToolbarStyle))

/** The grid size radio group's options. */
export const SizeOptions: SlotView.SlotView<typeof ToolbarSlots, RadioGroup.RenderInfo, Message> =
  define(ToolbarSlots, (render: RadioGroup.RenderInfo, slots, h) => {
    const { group, options } = RadioGroupAdapter.resolve<string, undefined, Message>(
      render,
      [SizeOptionStyle.mixin],
      { input: undefined, h },
    )
    return h.div(
      slots.sizeGroup.attrs(group),
      options.map(option => h.button(option.option, [option.value])),
    )
  }).pipe(Style.attach(ToolbarStyle))

/** The palette radio group's swatches, each colored through `--swatch-color`. */
export const PaletteOptions = define(
  ToolbarSlots,
  (input: Readonly<{ render: RadioGroup.RenderInfo; theme: PaletteTheme }>, slots, h) => {
    const { group, options } = RadioGroupAdapter.resolve<string, undefined, Message>(
      input.render,
      [SwatchStyle.mixin],
      { input: undefined, h },
    )
    return h.div(
      slots.paletteGroup.attrs(group),
      options.map(option => {
        const hexColor = input.theme.colors[Number(option.value)] ?? EMPTY_COLOR
        return h.button(
          [...option.option, h.Style({ '--swatch-color': hexColor })],
          [h.span(option.label, [hexColor])],
        )
      }),
    )
  },
).pipe(Style.attach(ToolbarStyle))

/** The theme listbox's button: the theme's name and a chevron. */
export const ThemeButtonContent = define(ToolbarSlots, (theme: PaletteTheme, slots, h) =>
  h.div(slots.themeButtonContent.attrs(), [
    h.span(slots.themeName.attrs(), [theme.name]),
    chevronDownIcon(slots, h),
  ]),
).pipe(Style.attach(ToolbarStyle))

/** One theme in the listbox, checked when it is the current one. */
export const ThemeOption = define(
  ToolbarSlots,
  (input: Readonly<{ themeName: string; isSelected: boolean }>, slots, h) =>
    h.div(slots.themeOption.attrs(), [
      h.span(slots.themeName.attrs(), [input.themeName]),
      ...(input.isSelected ? [h.span(slots.themeCheck.attrs(), ['✓'])] : []),
    ]),
).pipe(Style.attach(ToolbarStyle))

// SECTION

/** The two mirror switches, drawn as H and V toggle buttons. */
export const MirrorSection = define(ToolbarSlots, (mirrorMode: MirrorMode, slots, h) => {
  const isMirrorHorizontal = mirrorMode === 'Horizontal' || mirrorMode === 'Both'
  const isMirrorVertical = mirrorMode === 'Vertical' || mirrorMode === 'Both'

  const mirrorSwitch = (config: {
    readonly id: string
    readonly isChecked: boolean
    readonly onToggle: () => Message
    readonly label: string
    readonly letter: string
  }): Html =>
    UiSwitch.view(
      {
        id: config.id,
        isChecked: config.isChecked,
        onToggle: config.onToggle,
        toView: attributes => {
          const { button, label } = Switch.resolve<undefined, Message>(
            attributes,
            [MirrorSwitchStyle.mixin],
            { input: undefined, h },
          )
          return h.div(slots.mirrorSwitch.attrs(), [
            h.span(label, [config.label]),
            h.button(button, [config.letter]),
          ])
        },
      },
      h,
    )

  return h.div(slots.section.attrs(), [
    sectionLabel('Mirror', slots, h),
    h.div(slots.mirrorGroup.attrs(), [
      mirrorSwitch({
        id: MIRROR_HORIZONTAL_SWITCH_ID,
        isChecked: isMirrorHorizontal,
        onToggle: () => Message.ToggledMirrorHorizontal(),
        label: 'Mirror horizontal',
        letter: 'H',
      }),
      mirrorSwitch({
        id: MIRROR_VERTICAL_SWITCH_ID,
        isChecked: isMirrorVertical,
        onToggle: () => Message.ToggledMirrorVertical(),
        label: 'Mirror vertical',
        letter: 'V',
      }),
    ]),
  ])
}).pipe(Style.attach(ToolbarStyle))

/** Clear Canvas, disabled while there is nothing to clear. */
export const ClearCanvas = define(ToolbarSlots, (isCanvasEmpty: boolean, slots, h) =>
  UiButton.view(
    {
      onClick: Message.ClickedClear(),
      isDisabled: isCanvasEmpty,
      toView: attributes =>
        h.button(
          Button.resolve<undefined, Message>(attributes, [FullWidthButtonStyle.mixin], {
            input: undefined,
            h,
          }).button,
          [trashIcon(slots, h), h.span(slots.buttonText.attrs(), ['Clear Canvas'])],
        ),
    },
    h,
  ),
).pipe(Style.attach(ToolbarStyle))

// PANEL

export type ToolPanelInput = Readonly<{
  mirrorMode: MirrorMode
  tool: Tool
  gridSize: number
  selectedColorIndex: PaletteIndex
  isCanvasEmpty: boolean
  paletteThemeIndex: number
  themeListbox: Listbox.Model
  toolRadioGroup: RadioGroup.Model
  gridSizeRadioGroup: RadioGroup.Model
  paletteRadioGroup: RadioGroup.Model
}>

const toolSectionView = (input: ToolPanelInput, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.section.attrs(), [
    sectionLabel('Tools', slots, h),
    h.submodel({
      slotId: input.toolRadioGroup.id,
      model: input.toolRadioGroup,
      view: ToolRadioGroup.view,
      viewInputs: {
        selectedValue: Option.some(input.tool),
        options: TOOLS,
        ariaLabel: 'Drawing tool',
        toView: render => ToolOptions(render, h),
      },
      toParentMessage: message => Message.GotToolRadioGroupMessage({ message }),
    }),
  ])

const sizeSectionView = (input: ToolPanelInput, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.section.attrs(), [
    sectionLabel('Grid Size', slots, h),
    h.submodel({
      slotId: input.gridSizeRadioGroup.id,
      model: input.gridSizeRadioGroup,
      view: GridSizeRadioGroup.view,
      viewInputs: {
        selectedValue: Option.some(input.gridSize.toString()),
        options: GRID_SIZE_STRINGS,
        ariaLabel: 'Grid size',
        orientation: 'Horizontal',
        toView: render => SizeOptions(render, h),
      },
      toParentMessage: message => Message.GotGridSizeRadioGroupMessage({ message }),
    }),
  ])

const themeListboxView = (
  input: ToolPanelInput,
  theme: PaletteTheme,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: input.themeListbox.id,
    model: input.themeListbox,
    view: ThemeListbox.view,
    viewInputs: {
      anchor: THEME_LISTBOX_ANCHOR,
      items: THEME_INDEX_STRINGS,
      maybeSelectedValue: Option.some(input.paletteThemeIndex.toString()),
      itemToConfig: (indexString, { isSelected }) => ({
        content: ThemeOption(
          {
            themeName: PALETTE_THEMES[Number(indexString)]?.name ?? indexString,
            isSelected,
          },
          h,
        ),
      }),
      buttonContent: ThemeButtonContent(theme, h),
      buttonAttributes: childAttributes(slots.themeButton.attrs()),
      itemsAttributes: childAttributes(slots.themeItems.attrs()),
      backdropAttributes: childAttributes(slots.themeBackdrop.attrs()),
      attributes: childAttributes(slots.themePicker.attrs()),
    },
    toParentMessage: message => Message.GotThemeListboxMessage({ message }),
  })

const paletteSectionView = (input: ToolPanelInput, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const theme = currentPaletteTheme(input)
  const paletteIndexStrings = theme.colors.map((_, index) => index.toString())
  const selectedHexColor = theme.colors[input.selectedColorIndex] ?? EMPTY_COLOR

  return h.div(slots.section.attrs(), [
    sectionLabel('Color', slots, h),
    h.div(slots.hex.attrs(), [selectedHexColor]),
    h.submodel({
      slotId: input.paletteRadioGroup.id,
      model: input.paletteRadioGroup,
      view: PaletteRadioGroup.view,
      viewInputs: {
        selectedValue: Option.some(input.selectedColorIndex.toString()),
        options: paletteIndexStrings,
        ariaLabel: 'Color palette',
        orientation: 'Horizontal',
        toView: render => PaletteOptions({ render, theme }, h),
      },
      toParentMessage: message => Message.GotPaletteRadioGroupMessage({ message }),
    }),
    themeListboxView(input, theme, slots, h),
  ])
}

/** The left column: tools, mirror, grid size, palette and theme, and Clear Canvas. */
export const ToolPanel = define(ToolbarSlots, (input: ToolPanelInput, slots, h) =>
  h.div(slots.panel.attrs(), [
    toolSectionView(input, slots, h),
    MirrorSection(input.mirrorMode, h),
    sizeSectionView(input, slots, h),
    paletteSectionView(input, slots, h),
    ClearCanvas(input.isCanvasEmpty, h),
  ]),
).pipe(Style.attach(ToolbarStyle))
