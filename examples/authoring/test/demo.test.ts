import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('the demo trace', () => {
  it('prints what each update decided', () => {
    expect(runDemo().slice(0, 12)).toEqual([
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

  it('traces the newer sections too: what each one decided', () => {
    expect(runDemo()).toEqual(
      expect.arrayContaining([
        'a lasso over c and e: selected c, e; says 2 selected',
        'dragged by 35, 25: x 120, y 60, 100 by 80',
        'at the bound: value=100 commands=Repeat.elapse, StopRepeat',
        'long swipe toward the end: closed done=pin',
        'shift-click file-06: file-03, file-04, file-05, file-06',
        'renamed: title=Title 3 [Undo rename] [Redo]',
      ]),
    )
  })
})
