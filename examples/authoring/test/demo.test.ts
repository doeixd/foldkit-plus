import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('the demo trace', () => {
  it('prints what each update decided', () => {
    expect(runDemo()).toEqual([
      'search: results=0',
      'search typed ap: apple, apricot',
      'search draws 2 options',
      'search picked: query=apricot results=0',
      'search attachments: SearchKeys, Pointing, Collection, FocusRecovery, SearchStyle',
      'popup: Choose',
      'popup opened: open=true',
      'popup daily is disabled: unchanged=true',
      'popup picked: Weekly open=false',
      'list: Write the guide | Review the pull request | Ship it',
      'list after dropping the first row last: Review the pull request | Ship it | Write the guide',
      'list added: 4 rows',
    ])
  })
})
