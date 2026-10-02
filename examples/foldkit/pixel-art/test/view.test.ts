import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { EMPTY_COLOR, GRID_SIZE_STRINGS } from '../src/constant.js'
import { createEmptyGrid } from '../src/grid.js'
import { PALETTE_THEMES } from '../src/palette.js'
import { stylesheet } from '../src/style.js'
import { Canvas } from '../src/view/canvas.js'
import { ErrorDialogContent, GridSizeConfirmDialogContent } from '../src/view/dialog.js'
import { HistoryPanel, type HistoryPanelInput } from '../src/view/history.js'
import {
  ClearCanvas,
  MirrorSection,
  PaletteOptions,
  SizeOptions,
  ThemeButtonContent,
  ThemeOption,
  ToolOptions,
} from '../src/view/toolbar.js'
import { Header } from '../src/view/view.js'
import { openDialogRender, paintedGrid, radioRender, showing } from './fixtures.js'

const theme = PALETTE_THEMES[0]
const [syntax0, , , syntax3, , , , , , syntax9] = theme.colors

const hovering = (x: number, y: number) =>
  modifyFields(showing(paintedGrid), { maybeHoveredCell: () => Option.some({ x, y }) })

/** Seven undo steps, one more than the panel shows, and two redo steps. */
const historyInput: HistoryPanelInput = {
  past: Array.from({ length: 7 }, () => createEmptyGrid(4)),
  future: [createEmptyGrid(4), paintedGrid],
  shownGrid: paintedGrid,
  gridSize: 4,
  theme,
}

const trees: ReadonlyArray<readonly [string, Html]> = [
  ['the header', Inert.draw(Header, undefined)],
  ['the canvas', Inert.draw(Canvas, hovering(0, 0))],
  ['the history', Inert.draw(HistoryPanel, historyInput)],
  ['the tools', Inert.draw(ToolOptions, radioRender(['Brush', 'Fill', 'Eraser'], 'Fill'))],
  ['the grid sizes', Inert.draw(SizeOptions, radioRender(GRID_SIZE_STRINGS, '16'))],
  [
    'the palette',
    Inert.draw(PaletteOptions, {
      render: radioRender(['0', '1', '2'], '1'),
      theme,
    }),
  ],
  ['the theme button', Inert.draw(ThemeButtonContent, theme)],
  ['a chosen theme', Inert.draw(ThemeOption, { themeName: 'Syntax', isSelected: true })],
  ['the mirror switches', Inert.draw(MirrorSection, 'Both')],
  ['Clear Canvas', Inert.draw(ClearCanvas, false)],
  [
    'the export error',
    Inert.draw(ErrorDialogContent, {
      render: openDialogRender,
      maybeExportError: Option.some('Canvas 2D context not available'),
    }),
  ],
  [
    'the grid size confirmation',
    Inert.draw(GridSizeConfirmDialogContent, {
      render: openDialogRender,
      maybePendingGridSize: Option.some(8),
    }),
  ],
]

const colorsOf = (tree: Html): ReadonlyArray<string | undefined> =>
  Inert.bySlot(tree, 'cell').map(cell => Inert.style(cell)['--pixel-color'])

describe('every view', () => {
  test.each(trees)('draws every element of %s through a Slot', (_, tree) => {
    expect(Inert.unslotted(tree)).toEqual([])
  })

  test.each(trees)('writes only custom properties inline in %s', (_, tree) => {
    expect(Inert.fixedInline(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    for (const [, tree] of trees) {
      expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
      expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
    }
  })
})

describe('the canvas', () => {
  test('draws a row per grid row and a cell per pixel, each in its color', () => {
    const tree = Inert.draw(Canvas, showing(paintedGrid))
    const colors = colorsOf(tree)

    expect(Inert.bySlot(tree, 'row')).toHaveLength(4)
    expect(colors).toHaveLength(16)
    expect(colors[1 * 4 + 1]).toBe(syntax3)
    expect(colors[3 * 4 + 2]).toBe(syntax9)
    expect(colors.filter(color => color === EMPTY_COLOR)).toHaveLength(14)
  })

  test('reads the color a cell gets from its custom property', () => {
    const cells = Inert.bySlot(Inert.draw(Canvas, showing(paintedGrid)), 'cell')
    expect(Inert.css(cells.slice(0, 1))).toContain('background:var(--pixel-color)')
  })

  test.each([
    {
      case: 'the brush previews the hovered cell in the selected color',
      model: hovering(0, 0),
      previewed: [0],
      color: syntax0,
    },
    {
      case: 'the brush previews the mirrored cell too',
      model: modifyFields(hovering(0, 0), { mirrorMode: () => 'Horizontal' as const }),
      previewed: [0, 3],
      color: syntax0,
    },
    {
      case: 'the eraser previews in the empty color',
      model: modifyFields(hovering(1, 1), { tool: () => 'Eraser' as const }),
      previewed: [1 * 4 + 1],
      color: EMPTY_COLOR,
    },
    {
      case: 'the fill previews the region it would fill, ignoring the mirror',
      model: modifyFields(hovering(1, 1), {
        tool: () => 'Fill' as const,
        selectedColorIndex: () => 0 as const,
        mirrorMode: () => 'Both' as const,
      }),
      previewed: [1 * 4 + 1],
      color: syntax0,
    },
  ])('$case', ({ model, previewed, color }) => {
    const colors = colorsOf(Inert.draw(Canvas, model))
    const unhovered = colorsOf(
      Inert.draw(Canvas, modifyFields(model, { maybeHoveredCell: () => Option.none() })),
    )
    expect(colors).toEqual(
      unhovered.map((unchanged, index) => (previewed.includes(index) ? color : unchanged)),
    )
  })

  test('previews nothing mid-stroke', () => {
    const drawing = modifyFields(hovering(0, 0), { isDrawing: () => true })
    expect(colorsOf(Inert.draw(Canvas, drawing))).toEqual(
      colorsOf(Inert.draw(Canvas, showing(paintedGrid))),
    )
  })
})

describe('the history panel', () => {
  const tree = Inert.draw(HistoryPanel, historyInput)
  const entries = Inert.bySlot(tree, 'entry')

  test('lists the redo steps, the current grid, then the six latest undo steps', () => {
    expect(entries.map(entry => Inert.text(Inert.bySlot(entry, 'entryLabel')[0]))).toEqual([
      'Forward 2',
      'Forward 1',
      'Current',
      'Back 1',
      'Back 2',
      'Back 3',
      'Back 4',
      'Back 5',
      'Back 6',
    ])
    expect(Inert.text(Inert.bySlot(tree, 'more')[0])).toBe('1 more…')
  })

  test('marks the current entry, and only it, as not a button', () => {
    expect(entries.map(entry => Inert.value(entry, 'data-entry'))).toEqual([
      'Step',
      'Step',
      'Current',
      ...Array.from({ length: 6 }, () => 'Step'),
    ])
    expect(entries.filter(entry => Inert.value(entry, 'role') === 'button')).toHaveLength(8)
  })

  test('draws a step as a thumbnail of its grid, as many columns as the grid', () => {
    const [farthest] = entries
    const thumbnail = Inert.bySlot(farthest, 'thumbnail')[0]
    expect(Inert.style(thumbnail)['--grid-size']).toBe('4')
    expect(
      Inert.bySlot(farthest, 'pixel').map(pixel => Inert.style(pixel)['--pixel-color']),
    ).toEqual(colorsOf(Inert.draw(Canvas, showing(paintedGrid))))
  })
})

describe('the palette', () => {
  test('colors each swatch with its theme color and names it for a screen reader', () => {
    const swatches = Inert.byTag(
      Inert.draw(PaletteOptions, { render: radioRender(['0', '3'], '0'), theme }),
      'button',
    )
    expect(swatches.map(swatch => Inert.style(swatch)['--swatch-color'])).toEqual([
      syntax0,
      syntax3,
    ])
    expect(swatches.map(swatch => Inert.text(swatch))).toEqual([syntax0, syntax3])
  })
})

describe('the export error', () => {
  test('marks its title as an error, which the dialog style colors red', () => {
    const titles = Inert.byTag(
      Inert.draw(ErrorDialogContent, {
        render: openDialogRender,
        maybeExportError: Option.some('Canvas 2D context not available'),
      }),
      'h2',
    )
    expect(titles.map(title => Inert.value(title, 'data-tone'))).toEqual(['error'])
    expect(Inert.css(titles)).toContain('[data-tone="error"]{color:var(--fk-forge-danger-ink)}')
  })

  test.each([
    [
      'the error',
      () =>
        Inert.draw(ErrorDialogContent, {
          render: openDialogRender,
          maybeExportError: Option.none(),
        }),
    ],
    [
      'the pending size',
      () =>
        Inert.draw(GridSizeConfirmDialogContent, {
          render: openDialogRender,
          maybePendingGridSize: Option.none(),
        }),
    ],
  ])('draws an empty panel without %s', (_, draw) => {
    expect(Inert.byTag(draw(), 'h2')).toEqual([])
  })
})
