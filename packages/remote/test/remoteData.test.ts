import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { RemoteData } from '../src/index.js'

describe('RemoteData', () => {
  const label = (data: RemoteData<number>): string =>
    RemoteData.match(data, {
      Initial: () => 'initial',
      Loading: () => 'loading',
      Ready: value => `ready:${value}`,
      Refreshing: value => `refreshing:${value}`,
      Failed: (error, previous) =>
        `failed:${error._tag}:${Option.isSome(previous) ? previous.value : 'none'}`,
      NotFound: () => 'notfound',
    })

  it('matches every state', () => {
    expect(label({ _tag: 'Initial' })).toBe('initial')
    expect(label({ _tag: 'Loading' })).toBe('loading')
    expect(label({ _tag: 'Ready', value: 1 })).toBe('ready:1')
    expect(label({ _tag: 'Refreshing', value: 2 })).toBe('refreshing:2')
    expect(label({ _tag: 'Failed', error: { _tag: 'Boom', message: 'x' } })).toBe(
      'failed:Boom:none',
    )
    expect(label({ _tag: 'Failed', error: { _tag: 'Boom', message: 'x' }, previous: 3 })).toBe(
      'failed:Boom:3',
    )
    expect(label({ _tag: 'NotFound' })).toBe('notfound')
  })

  it('maps values and preserves failures', () => {
    expect(RemoteData.map({ _tag: 'Ready', value: 2 }, n => n + 1)).toEqual({
      _tag: 'Ready',
      value: 3,
    })
    expect(RemoteData.map({ _tag: 'NotFound' }, (n: number) => n + 1)).toEqual({
      _tag: 'NotFound',
    })
    expect(
      RemoteData.map(
        { _tag: 'Failed', error: { _tag: 'Boom', message: 'x' }, previous: 2 },
        n => n + 1,
      ),
    ).toEqual({ _tag: 'Failed', error: { _tag: 'Boom', message: 'x' }, previous: 3 })
  })

  it('maps refreshing values and leaves valueless states untouched', () => {
    const inc = (n: number) => n + 1
    expect(RemoteData.map({ _tag: 'Refreshing', value: 2 }, inc)).toEqual({
      _tag: 'Refreshing',
      value: 3,
    })
    expect(RemoteData.map({ _tag: 'Initial' }, inc)).toEqual({ _tag: 'Initial' })
    expect(RemoteData.map({ _tag: 'Loading' }, inc)).toEqual({ _tag: 'Loading' })
    expect(RemoteData.map({ _tag: 'Failed', error: { _tag: 'Boom', message: 'x' } }, inc)).toEqual({
      _tag: 'Failed',
      error: { _tag: 'Boom', message: 'x' },
    })
  })
})

describe('RemoteData.render keeps useful data on screen', () => {
  const error = { _tag: 'RemoteReadError', message: 'down' }
  const drawn = (data: RemoteData<number>): string =>
    RemoteData.render(data, {
      loading: () => 'skeleton',
      notFound: () => 'no such row',
      failed: failure => `error:${failure._tag}`,
      data: (value, freshness) =>
        freshness._tag === 'Stale'
          ? `${value} (stale: ${freshness.error.message})`
          : freshness._tag === 'Refreshing'
            ? `${value} (refreshing)`
            : `${value}`,
    })

  it.each([
    { state: 'Initial', data: { _tag: 'Initial' } as const, drawn: 'skeleton' },
    { state: 'Loading', data: { _tag: 'Loading' } as const, drawn: 'skeleton' },
    { state: 'NotFound', data: { _tag: 'NotFound' } as const, drawn: 'no such row' },
    { state: 'Ready', data: { _tag: 'Ready', value: 7 } as const, drawn: '7' },
    {
      state: 'Refreshing',
      data: { _tag: 'Refreshing', value: 7 } as const,
      drawn: '7 (refreshing)',
    },
    {
      state: 'Failed with nothing to show',
      data: { _tag: 'Failed', error } as const,
      drawn: 'error:RemoteReadError',
    },
    {
      state: 'Failed over a value it had',
      data: { _tag: 'Failed', error, previous: 7 } as const,
      drawn: '7 (stale: down)',
    },
  ])('draws $state as $drawn', ({ data, drawn: expected }) => {
    expect(drawn(data)).toBe(expected)
  })

  it('tells a stale value apart from a fresh one carrying the same number', () => {
    expect(drawn({ _tag: 'Ready', value: 7 })).not.toBe(
      drawn({ _tag: 'Failed', error, previous: 7 }),
    )
  })

  it('reaches the failed branch only when there is nothing left to draw', () => {
    const branches: string[] = []
    RemoteData.render(
      { _tag: 'Failed', error, previous: 7 },
      {
        loading: () => branches.push('loading'),
        notFound: () => branches.push('notFound'),
        failed: () => branches.push('failed'),
        data: () => branches.push('data'),
      },
    )

    expect(branches).toEqual(['data'])
  })
})
