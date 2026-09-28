import { Array, Effect, Predicate, Schema } from 'effect'
import { Command } from 'foldkit'

import { CANVAS_SIZE_PX, EXPORT_SCALE } from './constant.js'
import { Message } from './message.js'
import { Grid } from './model.js'
import { PALETTE_THEMES, resolveColor } from './palette.js'

export const ExportPng = Command.define('ExportPng', {
  args: {
    grid: Grid,
    gridSize: Schema.Number,
    paletteThemeIndex: Schema.Number,
  },
  messages: [Message.SucceededExportPng, Message.FailedExportPng],
  execute: ({ grid, gridSize, paletteThemeIndex }) =>
    Effect.gen(function* () {
      const theme = PALETTE_THEMES[paletteThemeIndex] ?? PALETTE_THEMES[0]
      const scale = Math.max(1, Math.floor(CANVAS_SIZE_PX / gridSize)) * EXPORT_SCALE
      const canvas = document.createElement('canvas')
      canvas.width = gridSize * scale
      canvas.height = gridSize * scale
      const context = canvas.getContext('2d')

      if (Predicate.isNull(context)) {
        return yield* Effect.fail(
          Message.FailedExportPng({ error: 'Canvas 2D context not available' }),
        )
      }

      Array.forEach(grid, (row, y) => {
        Array.forEach(row, (cell, x) => {
          context.fillStyle = resolveColor(cell, theme)
          context.fillRect(x * scale, y * scale, scale, scale)
        })
      })

      const link = document.createElement('a')
      link.download = 'pixel-art.png'
      link.href = canvas.toDataURL('image/png')
      link.click()

      return Message.SucceededExportPng()
    }).pipe(
      Effect.catchTag('FailedExportPng', error => Effect.succeed(error)),
      Effect.catch(() =>
        Effect.succeed(Message.FailedExportPng({ error: 'Failed to export image' })),
      ),
    ),
})
