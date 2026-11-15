import {
  applyTheme,
  chooseTheme,
  themeChanges,
  themeScript,
  type ThemeNames,
} from 'foldkit-mixins/theme/runtime'

const themes: ThemeNames<'soft' | 'hard'> = {
  names: ['soft', 'hard'],
  initial: 'soft',
  attribute: 'data-theme',
}

console.log(applyTheme(themes, 'hard'), chooseTheme(themes, 'hard'), themeChanges(themes))
console.log(themeScript(themes))
