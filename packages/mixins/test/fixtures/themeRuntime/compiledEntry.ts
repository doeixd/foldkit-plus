import { Theme, Themes, themeChanges } from 'foldkit-mixins/theme'

const themes = Themes.make({ a: Theme.make({}), b: Theme.make({}) }, { initial: 'a' })
console.log(Themes.apply(themes, 'b'), themeChanges(themes))
