import { ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('progress'),
  ProgressSlots,
  Recipes.Progress,
  (style, live) => Snippet.progress(style, live.h),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: (style, live) => Snippet.progress(style, live.h) },
    {
      name: 'value',
      title: 'With its value',
      draw: style => Snippet.progressValue(style, inert),
    },
    {
      name: 'stacked',
      title: 'Stacked',
      draw: style => Snippet.progressStacked(style, inert),
      pins: { shape: 'bar' },
    },
    {
      name: 'buffer',
      title: 'Buffered',
      draw: style => Snippet.progressBuffer(style, inert),
      pins: { shape: 'bar' },
    },
    {
      name: 'striped',
      title: 'Striped and moving',
      draw: style => Snippet.progressStriped(style, inert),
      pins: { shape: 'bar', stripes: 'moving', size: 'lg' },
    },
    {
      name: 'ring',
      title: 'A ring with its value',
      draw: style => Snippet.progressRing(style, inert),
      pins: { shape: 'ring', size: 'lg' },
    },
    {
      name: 'steps',
      title: 'Steps as progress',
      draw: style => Snippet.progressSteps(style, inert),
      pins: { shape: 'bar' },
    },
  ],
)
