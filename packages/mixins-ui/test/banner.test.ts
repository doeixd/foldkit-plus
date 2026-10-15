/**
 * Banner as markup: a region named by its label, an action that is a link
 * or a button by what it is given, and a dismiss button only when the
 * application can dismiss it, named after the region.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Banner, BannerSlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(BannerSlots)(Recipes.Banner({ tone: 'warning', emphasis: 'bold' }))

describe('Banner.view', () => {
  it('meets the banner pattern', () => {
    expect(A11y.validate(Patterns.Banner, BannerSlots)).toEqual([])
  })

  it('is a region named by its label, with no dismiss button unless asked', () => {
    const drawn = Banner.view({ label: 'Maintenance', message: 'Down at noon.', style }, h)
    const [region] = Inert.byTag(drawn, 'section')
    expect(Inert.value(region, 'aria-label')).toBe('Maintenance')
    expect(Inert.text(region)).toBe('Down at noon.')
    expect(Inert.byTag(drawn, 'button')).toEqual([])
  })

  it('draws a link action as a link and a pressed one as a button', () => {
    const linked = Banner.view(
      { label: 'News', message: 'v2 is out.', action: { label: 'Read', href: '#v2' }, style },
      h,
    )
    const [link] = Inert.byTag(linked, 'a')
    expect(Inert.value(link, 'href')).toBe('#v2')
    expect(Inert.byTag(linked, 'button')).toEqual([])
    const pressed = Banner.view(
      {
        label: 'News',
        message: 'v2 is out.',
        action: { label: 'Upgrade', onClick: message('Other') },
        style,
      },
      h,
    )
    const [button] = Inert.byTag(pressed, 'button')
    expect(Inert.text(button)).toBe('Upgrade')
    expect(button?.data?.on?.['click']).toBeTypeOf('function')
    expect(Inert.byTag(pressed, 'a')).toEqual([])
  })

  it('names its dismiss button after the region, or as told', () => {
    const named = (dismissLabel?: string) => {
      const [button] = Inert.byTag(
        Banner.view(
          {
            label: 'Cookies',
            message: 'We use cookies.',
            onDismiss: message('Clicked'),
            ...(dismissLabel === undefined ? {} : { dismissLabel }),
            style,
          },
          h,
        ),
        'button',
      )
      expect(button?.data?.on?.['click']).toBeTypeOf('function')
      return Inert.value(button, 'aria-label')
    }
    expect(named()).toBe('Dismiss Cookies')
    expect(named('Accept and close')).toBe('Accept and close')
  })
})
