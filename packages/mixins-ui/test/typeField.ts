/** The Input recipe's field, drawn alone, shared by the fine and coarse pointer files. */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { InputSlots, Recipes } from '../src/index.js'

const input = Style.forSlots(InputSlots)(Recipes.Input({}))

/** Removes what `field` drew. */
export const clearField = () => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
}

/** The Input recipe's control, by the class its sheet names first. */
export const field = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('tokens', Theme.root(Theme.tokens)),
    ) + input.css
  document.head.append(sheet)
  const name = /\.(style-[a-z0-9]+)\{/.exec(input.css)![1]!
  const element = document.createElement('input')
  element.className = name
  document.body.append(element)
  return element
}
