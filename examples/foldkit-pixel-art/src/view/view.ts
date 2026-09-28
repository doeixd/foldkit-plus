import * as UiButton from '@foldkit/ui/button'
import { Array, Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

import { isGridEmpty } from '../grid.js'
import { Message } from '../message.js'
import type { Grid, Model } from '../model.js'
import { type PaletteTheme, currentPaletteTheme } from '../palette.js'
import { PageSlots, PageStyle, SecondaryButtonStyle } from '../style.js'
import { Canvas } from './canvas.js'
import {
  type ErrorDialogInput,
  type GridSizeConfirmDialogInput,
  errorDialogView,
  gridSizeConfirmDialogView,
} from './dialog.js'
import { HistoryPanel, type HistoryPanelInput } from './history.js'
import { ToolPanel, type ToolPanelInput } from './toolbar.js'

type Slots = SlotBuilders<typeof PageSlots, Message>

/**
 * What the page draws from: the Model, and each panel's inputs beside it, so
 * a panel is drawn again only when one of the values it reads changes by
 * identity, as upstream's `createLazy` panels are.
 */
type PageInput = Readonly<{ model: Model }> &
  ToolPanelInput &
  HistoryPanelInput &
  ErrorDialogInput &
  GridSizeConfirmDialogInput

/** A future with nothing in it, one value: `History.push` makes a new empty one each cell of a stroke. */
const NO_GRIDS: ReadonlyArray<Grid> = []

export const pageInput = (model: Model): PageInput => {
  const theme: PaletteTheme = currentPaletteTheme(model)
  const { past, future, present } = model.history
  return {
    ...model,
    model,
    isCanvasEmpty: isGridEmpty(present),
    past,
    future: Array.isReadonlyArrayNonEmpty(future) ? future : NO_GRIDS,
    // A stroke shows the grid from before it until it ends, so the panel is not drawn per cell.
    shownGrid: model.isDrawing ? Option.getOrElse(Array.last(past), () => present) : present,
    theme,
  }
}

const downloadIcon = (slots: Slots, h: HtmlBuilder<Message>): Html =>
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
            'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
          ),
        ]),
      ),
    ],
  )

/** The title, the links, and Export PNG: drawn once, since it reads nothing. */
export const Header = SlotView.forMessages<Message>()
  .define(PageSlots, (_: undefined, slots, h) =>
    h.div(slots.header.attrs(), [
      h.div(slots.brand.attrs(), [
        h.h1(slots.title.attrs(), ['PixelForge']),
        h.div(slots.byline.attrs(), [
          h.a(slots.link.attrs([h.Href('https://foldkit.dev')]), ['Built with Foldkit']),
          h.span(slots.separator.attrs(), ['/']),
          h.a(
            slots.link.attrs([
              h.Href('https://github.com/foldkit/foldkit/tree/main/examples/pixel-art'),
            ]),
            ['Source on GitHub'],
          ),
        ]),
      ]),
      h.div(slots.actions.attrs(), [
        UiButton.view(
          {
            onClick: Message.ClickedExport(),
            toView: attributes =>
              h.button(
                Button.resolve<undefined, Message>(attributes, [SecondaryButtonStyle.mixin], {
                  input: undefined,
                  h,
                }).button,
                [downloadIcon(slots, h), h.span(slots.buttonText.attrs(), ['Export PNG'])],
              ),
          },
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(PageStyle))

const Parts = SlotView.parts(PageSlots)<PageInput, Message>()

const HeaderPart = Parts.part('Header', { reads: [] }, (_, __, h) => Header(undefined, h))

const Tools = Parts.part(
  'Tools',
  {
    reads: [
      'mirrorMode',
      'tool',
      'gridSize',
      'selectedColorIndex',
      'isCanvasEmpty',
      'paletteThemeIndex',
      'themeListbox',
      'toolRadioGroup',
      'gridSizeRadioGroup',
      'paletteRadioGroup',
    ],
  },
  (input, _, h) => ToolPanel(input, h),
)

const History = Parts.part(
  'History',
  { reads: ['past', 'future', 'shownGrid', 'gridSize', 'theme'] },
  (input, _, h) => HistoryPanel(input, h),
)

const ErrorDialog = Parts.part(
  'ErrorDialog',
  { reads: ['errorDialog', 'maybeExportError'] },
  (input, _, h) => errorDialogView(input, h),
)

const GridSizeConfirmDialog = Parts.part(
  'GridSizeConfirmDialog',
  { reads: ['gridSizeConfirmDialog', 'maybePendingGridSize'] },
  (input, _, h) => gridSizeConfirmDialogView(input, h),
)

/** The page: the header, the three columns, and the two dialogs. */
const Page = Parts.assemble(
  (input, slots, h, draw) =>
    h.div(slots.page.attrs(), [
      draw(HeaderPart),
      h.div(slots.content.attrs(), [draw(Tools), Canvas(input.model, h), draw(History)]),
      draw(ErrorDialog),
      draw(GridSizeConfirmDialog),
    ]),
  { name: 'Page' },
).pipe(Style.attach(PageStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Pixel Art',
  body: Page(pageInput(model), h),
})
