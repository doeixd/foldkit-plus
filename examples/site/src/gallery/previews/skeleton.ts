import { Recipes, SkeletonSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('skeleton'),
  SkeletonSlots,
  Recipes.Skeleton,
  style => Snippet.skeleton(style, inert),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.skeleton(style, inert) },
    { name: 'lines', title: 'Lines', draw: style => Snippet.skeletonLines(style, inert) },
    { name: 'shapes', title: 'Shapes', draw: style => Snippet.skeletonShapes(style, inert) },
    {
      name: 'shimmer',
      title: 'Shimmer',
      draw: style => Snippet.skeletonShimmer(style, inert),
      pins: { animation: 'shimmer' },
    },
  ],
)
