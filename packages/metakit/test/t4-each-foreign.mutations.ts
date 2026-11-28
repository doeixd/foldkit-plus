const tests = ['packages/metakit/test/t4-each-foreign.test.ts']

export default [
  {
    name: 'findMatchedElement drops foreign implementations when evaluating child guard',
    edits: [
      {
        file: '../src/machine.ts',
        find: `      if (!matchElement(item, targetKey)) continue
      const guard = evalNode(
        transition.when.node,
        {
          state: item,
          input: outer.input,
          supplied: outer.supplied,
        },
        foreign,
      )`,
        replace: `      if (!matchElement(item, targetKey)) continue
      const guard = evalNode(transition.when.node, {
        state: item,
        input: outer.input,
        supplied: outer.supplied,
      })`,
      },
    ],
    tests,
  },
  {
    name: 'rewriteEmitNode drops foreign implementations when evaluating child emit',
    edits: [
      {
        file: '../src/machine.ts',
        find: `          onSome: item =>
            evalNode(node, { state: item, input: outer.input, supplied: outer.supplied }, foreign),`,
        replace: `          onSome: item =>
            evalNode(node, { state: item, input: outer.input, supplied: outer.supplied }),`,
      },
    ],
    tests,
  },
  {
    name: 'Machine.each write loop drops foreign implementations when evaluating child guard',
    edits: [
      {
        file: '../src/machine.ts',
        find: `                      if (!matchElement(item, targetKey)) {
                        next.push(item)
                        continue
                      }
                      const guard = evalNode(
                        transition.when.node,
                        {
                          state: item,
                          input: outer.input,
                          supplied: outer.supplied,
                        },
                        foreign,
                      )`,
        replace: `                      if (!matchElement(item, targetKey)) {
                        next.push(item)
                        continue
                      }
                      const guard = evalNode(transition.when.node, {
                        state: item,
                        input: outer.input,
                        supplied: outer.supplied,
                      })`,
      },
    ],
    tests,
  },
  {
    name: 'Machine.each write loop drops foreign implementations when calling Transition.step',
    edits: [
      {
        file: '../src/machine.ts',
        find: `                      const stepped = Transition.step(
                        transition,
                        item,
                        outer.input,
                        outer.supplied,
                        { foreign },
                      )`,
        replace: `                      const stepped = Transition.step(
                        transition,
                        item,
                        outer.input,
                        outer.supplied,
                      )`,
      },
    ],
    tests,
  },
  {
    name: 'findMatchedElement treats a refused child guard as no match',
    edits: [
      {
        file: '../src/machine.ts',
        find: `      if (Node.isRefusal(guard)) return guard
      if (guard === true) return Option.some(item)`,
        replace: `      if (guard === true) return Option.some(item)`,
      },
    ],
    tests,
  },
  {
    name: 'Machine.each write loop treats a refused child guard as no match',
    edits: [
      {
        file: '../src/machine.ts',
        find: `                      if (Node.isRefusal(guard)) return guard
                      if (guard !== true) {`,
        replace: `                      if (guard !== true) {`,
      },
    ],
    tests,
  },
]
