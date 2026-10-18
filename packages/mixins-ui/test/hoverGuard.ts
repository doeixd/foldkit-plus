/**
 * A box styled on hover, a mark inside a card that shows while the card is hovered or holds
 * focus, and a button pressed through the recipes' `hover` piece, for the hover guard's
 * browser tests (one file per pointer).
 */
import { Style } from 'foldkit-mixins'
import { hover } from '../src/recipes/design.js'

const RED = 'rgb(255, 0, 0)'

const box = Style.compose(
  Style.self({ backgroundColor: 'rgb(255, 255, 255)' }),
  Style.pseudo(':hover', { backgroundColor: RED }),
)
const mark = Style.compose(
  Style.self({ opacity: '0' }),
  Style.nest(':is(:hover, :focus-within) > &', { opacity: '1' }),
)

const pressable = Style.compose(Style.self({ color: 'rgb(0, 0, 0)' }), hover({ color: RED }))

const styled = Style.slots({ box, mark, pressable })
/** The class generated for the rules whose CSS says `property`. */
const classOf = (property: string): string => {
  const found = styled.style.rules.find(entry => entry.css.includes(property))
  if (found === undefined) throw new Error(`no rule sets ${property}`)
  return found.className
}

/** Draws the box, and a card holding a button and the mark. */
export const drawn = () => {
  const sheet = document.createElement('style')
  sheet.textContent = styled.style.css
  document.head.append(sheet)
  const target = document.createElement('div')
  target.id = 'hovered'
  target.className = classOf('background-color')
  target.textContent = 'Box'
  const card = document.createElement('div')
  card.id = 'card'
  const button = document.createElement('button')
  button.textContent = 'Focus me'
  const shown = document.createElement('span')
  shown.className = classOf('opacity')
  shown.textContent = 'Mark'
  card.append(button, shown)
  const pressed = document.createElement('button')
  pressed.id = 'pressable'
  pressed.className = classOf('{color:')
  pressed.textContent = 'Press me'
  document.body.append(target, card, pressed)
  return {
    filled: () => getComputedStyle(target).backgroundColor === RED,
    marked: () => getComputedStyle(shown).opacity === '1',
    lit: () => getComputedStyle(pressed).color === RED,
    button,
    remove: () => {
      sheet.remove()
      target.remove()
      card.remove()
      pressed.remove()
    },
  }
}
