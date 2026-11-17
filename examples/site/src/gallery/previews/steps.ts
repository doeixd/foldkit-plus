import { StepsSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('steps'),
  StepsSlots,
  Recipes.Steps,
  (style, live) => Snippet.steps(style, live.h),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: (style, live) => Snippet.steps(style, live.h) },
    { name: 'icons', title: 'Icons', draw: (style, live) => Snippet.stepsIcons(style, live.h) },
    {
      name: 'vertical',
      title: 'Vertical, with content',
      pins: { orientation: 'vertical' },
      draw: (style, live) => Snippet.stepsVertical(style, live.h),
    },
    {
      name: 'progress',
      title: 'A progress connector',
      pins: { connector: 'progress' },
      draw: (style, live) => Snippet.stepsProgress(style, live.h),
    },
    {
      name: 'dots',
      title: 'Dots',
      pins: { marker: 'dot' },
      draw: (style, live) => Snippet.stepsDots(style, live.h),
    },
  ],
)
