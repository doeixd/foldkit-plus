import { describe, expect, it } from 'vitest'
import { Attributes, SlotView } from '../src/index.js'
import { fakeChild, h, mount, type TestMessage } from './resolverFixture.js'

describe('Attributes', () => {
  const bundle = [
    fakeChild(h.Class('hidden')),
    h.Class('first'),
    h.OnClick({ _tag: 'Clicked' }),
    h.DataAttribute('status', 'ready'),
    h.Class('second'),
  ]

  it('reads the tag of a tagged attribute and none from a child', () => {
    expect(bundle.map(Attributes.tagOf)).toEqual([
      undefined,
      'Class',
      'OnClick',
      'DataAttribute',
      'Class',
    ])
  })

  it('finds the first attribute with a tag, skipping opaque children', () => {
    expect(Attributes.find(bundle, 'Class')?.value).toBe('first')
    expect(Attributes.find(bundle, 'OnClick')?.message).toEqual({ _tag: 'Clicked' })
    expect(Attributes.find(bundle, 'Id')).toBeUndefined()
  })

  it('filters every attribute with a tag in bundle order', () => {
    expect(Attributes.filter(bundle, 'Class').map(attribute => attribute.value)).toEqual([
      'first',
      'second',
    ])
    expect(Attributes.filter([h.OnMount(mount('a'))], 'OnMount')[0]?.action.name).toBe('a')
  })

  it('does not read a _tag inherited from the prototype', () => {
    const inherited = Object.create({ _tag: 'Class', value: 'proto' })
    expect(Attributes.find([inherited], 'Class')).toBeUndefined()
  })
})

describe('SlotView.inertBuilder', () => {
  it('builds the same tagged attributes as inertHtml', () => {
    expect(SlotView.inertBuilder<TestMessage>().OnClick({ _tag: 'Other' })).toEqual({
      _tag: 'OnClick',
      message: { _tag: 'Other' },
    })
  })
})
