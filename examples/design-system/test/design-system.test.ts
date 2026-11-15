import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Message, initModel, update } from '../src/main.js'
import { noTweaks, tweaksCss, valueOf, withTweak } from '../src/tweaks.js'

const modelForTests = initModel()

describe('design-system update', () => {
  it('selects a scheme and counts the specimen presses', () => {
    const scheme = update(modelForTests, Message.SchemeSelected({ scheme: 'dark' }))
    expect(scheme.model.scheme).toBe('dark')
    const clicked = update(scheme.model, Message.ButtonClicked())
    expect(clicked.model.clicks).toBe(1)
  })

  it('writes only the tweaked knobs on :root, unlayered, where derived tokens compute', () => {
    expect(tweaksCss(noTweaks)).toBe('')
    const tweaked = withTweak(withTweak(noTweaks, 'hue', 172), 'shadow', 60)
    expect(tweaksCss(tweaked)).toBe(':root{--fk-knob-accent-h:172;--fk-knob-shadow-strength:60%}')
  })

  it('shows the theme own value for a knob until a tweak covers it', () => {
    expect(valueOf('compact', noTweaks, 'density')).toBe(0.85)
    expect(valueOf('compact', withTweak(noTweaks, 'density', 1), 'density')).toBe(1)
  })

  it('picks a theme, clearing tweaks and announcing it, and applies it as a Command', () => {
    const tweaked = update(modelForTests, Message.TweakChanged({ tweak: 'radius', value: 1.5 }))
    expect(tweaked.model.tweaks.radius).toEqual(Option.some(1.5))
    const picked = update(tweaked.model, Message.ThemePicked({ name: 'soft' }))
    expect(picked.model.theme).toBe('soft')
    expect(picked.model.tweaks).toEqual(noTweaks)
    expect(picked.model.status).toBe('Soft theme applied')
    expect('commands' in picked ? picked.commands.length : 0).toBe(1)
  })

  it('returns the Model it was given for a choice already made', () => {
    expect(update(modelForTests, Message.ThemePicked({ name: 'shadcn' })).model).toBe(modelForTests)
    expect(update(modelForTests, Message.SchemeSelected({ scheme: 'system' })).model).toBe(
      modelForTests,
    )
    expect(update(modelForTests, Message.DirectionSelected({ dir: 'ltr' })).model).toBe(
      modelForTests,
    )
    expect(update(modelForTests, Message.TweaksReset()).model).toBe(modelForTests)
    expect(update(modelForTests, Message.ThemeChangedElsewhere({ name: 'shadcn' })).model).toBe(
      modelForTests,
    )
    expect(update(modelForTests, Message.SchemeChangedElsewhere({ scheme: 'system' })).model).toBe(
      modelForTests,
    )
  })

  it('keeps the Model when a tweak is set to the value it already holds', () => {
    const once = update(modelForTests, Message.TweakChanged({ tweak: 'hue', value: 172 }))
    expect(once.model).not.toBe(modelForTests)
    expect(update(once.model, Message.TweakChanged({ tweak: 'hue', value: 172 })).model).toBe(
      once.model,
    )
    const reset = update(once.model, Message.TweaksReset())
    expect(reset.model.tweaks).toEqual(noTweaks)
    expect(reset.model.status).toBe('Tweaks reset')
  })

  it('takes the theme and scheme another tab chose, and applies them here', () => {
    const theme = update(modelForTests, Message.ThemeChangedElsewhere({ name: 'hard' }))
    expect(theme.model.theme).toBe('hard')
    expect('commands' in theme ? theme.commands.length : 0).toBe(1)
    const scheme = update(modelForTests, Message.SchemeChangedElsewhere({ scheme: 'dark' }))
    expect(scheme.model.scheme).toBe('dark')
    expect('commands' in scheme ? scheme.commands.length : 0).toBe(1)
  })
})
