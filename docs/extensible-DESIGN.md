Yes — but I’d make one important distinction: the thing you extend should probably be a **declared/placed bundle**, not the bare `Hello` bundle.

Something like this is very plausible:

```ts
const Hello = Bundle.declare(HelloForm, "hello")

const Message = defineMessageUnion({
  ClickedReset: {},
}).pipe(
  MessageUnion.extend(Hello),
)
```

which would be equivalent to today’s:

```ts
const Message = defineMessageUnion({
  ClickedReset: {},
  ...Hello.cases,
})
```

The reason I prefer `Hello` after `Bundle.declare(...)` is that the bare bundle doesn't know how its messages should appear in the parent. A reusable `HelloForm` might be placed twice:

```ts
const Primary = Bundle.declare(HelloForm, "primary")
const Secondary = Bundle.declare(HelloForm, "secondary")
```

Those need distinct parent cases:

```ts
GotPrimaryMessage: {
  message: HelloForm.Message
}

GotSecondaryMessage: {
  message: HelloForm.Message
}
```

That's already why Bundle uses wrapped messages rather than flattening a child's cases directly: flattening breaks routing when the same child is placed more than once.

So this:

```ts
MessageUnion.extend(HelloForm)
```

is underspecified.

But this:

```ts
MessageUnion.extend(Hello)
```

where `Hello` is a declaration, has everything necessary.

### I actually like the API

You could get:

```ts
const Dark = Bundle.declare(MediaQuery, "dark")
const Narrow = Bundle.declare(MediaQuery, "narrow")

const Message = defineMessageUnion({
  ClickedHelp: {},
}).pipe(
  MessageUnion.extend(Dark),
  MessageUnion.extend(Narrow),
)
```

instead of:

```ts
const Message = defineMessageUnion({
  ...Dark.cases,
  ...Narrow.cases,
  ClickedHelp: {},
})
```

And it would feel much more consistent with Effect/Foldkit-Plus:

```ts
const Message = defineMessageUnion({
  ClickedHelp: {},
}).pipe(
  MessageUnion.extend(Dark),
  MessageUnion.extend(Narrow),
  MessageUnion.extend(Uploads),
)
```

You could potentially support multiple at once too:

```ts
const Message = defineMessageUnion({
  ClickedHelp: {},
}).pipe(
  MessageUnion.extend(Dark, Narrow, Uploads),
)
```

### But there are really two possible APIs

One operates on cases **before** `defineMessageUnion`:

```ts
const Message = MessageUnion.make({
  ClickedHelp: {},
}).pipe(
  MessageUnion.with(Dark),
  MessageUnion.with(Narrow),
)
```

The other actually extends an already-created message union:

```ts
const Message = defineMessageUnion({
  ClickedHelp: {},
}).pipe(
  MessageUnion.extend(Dark),
  MessageUnion.extend(Narrow),
)
```

I prefer the second if Foldkit's returned MessageUnion can reasonably be made pipeable/cloneable, because it composes with the normal Foldkit API rather than replacing it.

The conceptual type is basically:

```ts
const extend =
  <D extends Bundle.Declaration<any, any, any>>(declaration: D) =>
  <M extends MessageUnion.Any>(
    message: M
  ): MessageUnion.Extend<M, D["cases"]> => {
    // combine original cases + declaration.cases
  }
```

The difficult part isn't runtime behavior—runtime is basically merging constructors/schemas. The important part is preserving the **rich union API and type inference**:

```ts
Message.Type
Message.match(...)
Message.guards
Message.isAnyOf(...)
Message.subset(...)
Message.ClickedHelp(...)
Message.GotDarkMessage(...)
```

The resulting object must be a genuine Foldkit `MessageUnion`, not just a `Schema.Union`.

### And I'd do the same for Model

This is where it becomes really attractive:

```ts
const Model = Schema.Struct({
  helpOpen: Schema.Boolean,
}).pipe(
  ModelStruct.extend(Dark),
  ModelStruct.extend(Narrow),
)

const Message = defineMessageUnion({
  ClickedHelp: {},
}).pipe(
  MessageUnion.extend(Dark),
  MessageUnion.extend(Narrow),
)
```

versus today's:

```ts
const Model = Schema.Struct({
  ...Dark.fields,
  ...Narrow.fields,
  helpOpen: Schema.Boolean,
})

const Message = defineMessageUnion({
  ...Dark.cases,
  ...Narrow.cases,
  ClickedHelp: {},
})
```

That gives you a really nice progression:

```ts
const Dark = Bundle.declare(MediaQuery, "dark")

const Model = BaseModel.pipe(
  Model.extend(Dark),
)

const Message = BaseMessage.pipe(
  MessageUnion.extend(Dark),
)
```

Although at that point you can see why `Bundle.compose()` exists: the Model and Message extensions are **two halves of the same operation**.

```ts
const App = Bundle.compose({
  helpOpen: Schema.Boolean,
}).pipe(
  Bundle.withChild("dark", MediaQuery, {
    args: { query: "(prefers-color-scheme: dark)" },
  }),
)
```

ensures they can never drift apart.

### So I would support both levels

I think there's room for both:

```ts
// Low-level composition
const Dark = Bundle.declare(MediaQuery, "dark")

const Model = Schema.Struct({
  helpOpen: Schema.Boolean,
}).pipe(
  Bundle.extendModel(Dark),
)

const Message = defineMessageUnion({
  ClickedHelp: {},
}).pipe(
  Bundle.extendMessages(Dark),
)
```

and:

```ts
// High-level composition
const App = Bundle.compose({
  helpOpen: Schema.Boolean,
}).pipe(
  Bundle.withMessages({
    ClickedHelp: {},
  }),
  Bundle.withChild("dark", MediaQuery),
)
```

The former is excellent when the user's Model/Message already exist or they're incrementally adopting Bundle. The latter is safer when defining an application from scratch.

I'd probably namespace the low-level operations under **Bundle**, though:

```ts
Message.pipe(
  Bundle.messages(Dark)
)
```

rather than:

```ts
Message.pipe(
  MessageUnion.extend(Dark)
)
```

because the operation is specifically interpreting a **Bundle declaration**.

Maybe:

```ts
const Message = defineMessageUnion({
  ClickedHelp: {},
}).pipe(
  Bundle.withCases(Dark),
)
```

and:

```ts
const Model = Schema.Struct({
  helpOpen: Schema.Boolean,
}).pipe(
  Bundle.withFields(Dark),
)
```

This nicely mirrors the existing properties:

```ts
Dark.fields
Dark.cases
```

so:

```text
spread syntax                 pipe syntax

...Dark.fields      →       Bundle.withFields(Dark)
...Dark.cases       →       Bundle.withCases(Dark)
```

That is probably the API I'd add. It doesn't replace `Bundle.compose`; it makes the **manual/lower-level path compositional too**.