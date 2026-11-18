import { Typography, TypographySlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

// The level picks the element, so a heading stays a heading to a screen
// reader, and the same level is written as `data-level` for the recipe to read.
export default example({
  title: 'The scale',
  slots: TypographySlots,
  recipe: Recipes.Typography,
  view: ({ style, h }) =>
    stack(h, [
      Typography.view({ level: 'h1', text: 'Heading one', style }, h),
      Typography.view({ level: 'h2', text: 'Heading two', style }, h),
      Typography.view({ level: 'h3', text: 'Heading three', style }, h),
      Typography.view(
        {
          level: 'lead',
          text: 'A lead paragraph sets the page apart from the body under it.',
          style,
        },
        h,
      ),
      Typography.view(
        {
          level: 'body',
          text: 'Body copy keeps a readable measure, so a long paragraph stays easy to follow.',
          style,
        },
        h,
      ),
      Typography.view({ level: 'muted', text: 'Muted, for what is secondary.', style }, h),
      Typography.view({ level: 'small', text: 'Small print for a footnote.', style }, h),
      Typography.view(
        { level: 'quote', text: 'A quote keeps its blockquote and a rule.', style },
        h,
      ),
      Typography.view({ level: 'code', text: "Typography.view({ level: 'code' })", style }, h),
    ]),
})
