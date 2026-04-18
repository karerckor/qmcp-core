# qmcp-core

Type-safe graph engine for branching workflows in TypeScript. Model any
step-by-step flow — surveys, onboarding, decision trees, wizards — as a
directed graph with compile-time-validated edges, typed answers, async
predicates, and full serialization of both graph structure and runtime
state.

The library ships a minimal, domain-agnostic core: no built-in question
types, no opinionated node kinds beyond `entry`/`question`/`result`/`end`.
Consumers declare their own question types and custom nodes through two
small factories (`defineQuestionType`, `defineNodeType`), and everything
else — answer extraction, edge validation, serialization — flows
uniformly through a single `_answerType` protocol.

## Install

```bash
bun install
```

## Quick Start

Because the core is domain-agnostic, the first thing an application does
is declare the question types it needs. This file is userland, not part
of the library.

```ts
// survey-types.ts
import { defineQuestionType, defineNodeType, type DynamicValue } from 'qmcp-core';

interface TextConfig { placeholder?: string; required?: boolean }
interface Option<T> { label: string; value: T }
interface RadioConfig<T> { options: readonly Option<T>[] }
interface CheckboxConfig<T> { options: readonly Option<T>[] }

export const text = defineQuestionType<'text', TextConfig, string>('text');

export function radio<const T>(config: RadioConfig<T>) {
  return defineQuestionType<'radio', RadioConfig<T>, T>('radio')(config);
}

export function checkbox<const T>(config: CheckboxConfig<T>) {
  return defineQuestionType<'checkbox', CheckboxConfig<T>, T[]>('checkbox')(config);
}

// Custom node kind — participates in the graph first-class
export const view = defineNodeType<'view', {
  title: DynamicValue;
  description?: DynamicValue;
  text: DynamicValue;
}>({ kind: 'view' });
```

Then build the graph:

```ts
import {
  createGraph, entry, question, result, end,
  edge, when, otherwise,
} from 'qmcp-core';
import { text, radio, checkbox, view } from './survey-types';

const survey = createGraph<{ name: string; age: number }>()([
  entry({
    title: ({ initial }) => `Hi, ${initial.name}!`,
    edges: [
      when(({ initial }) => initial.age >= 18, 'profession'),
      otherwise('school_subject'),
    ],
  }),
  question({
    id: 'profession',
    title: 'What is your profession?',
    question: text({ placeholder: 'e.g. developer' }),
    edges: [edge('food')],
  }),
  question({
    id: 'school_subject',
    title: 'Favourite school subject?',
    question: radio({
      options: [
        { label: 'Math',    value: 'math' },
        { label: 'English', value: 'english' },
      ],
    }),
    edges: [edge('food')],
  }),
  question({
    id: 'food',
    title: 'Favourite cuisine?',
    question: checkbox({
      options: [
        { label: 'Italian',  value: 'italian' },
        { label: 'Japanese', value: 'japanese' },
      ],
    }),
    edges: [
      when<'sushi_result', ('italian' | 'japanese')[]>(
        ({ answer }) => answer.includes('japanese'),
        'sushi_result',
      ),
      otherwise('generic_result'),
    ],
  }),
  result({ id: 'sushi_result',  title: 'You love sushi!' }),
  result({ id: 'generic_result', title: 'Thanks for participating' }),
  end(),
]);

const engine = survey.start({ name: 'Alice', age: 30 });

await engine.next();                  // entry -> profession
await engine.submit('developer');     // profession -> food
await engine.submit(['japanese']);    // food -> sushi_result

engine.status;                        // 'completed'
engine.getAnswer('profession');       // 'developer'  (typed as string)
engine.getAnswer('food');             // ['japanese'] (typed as ('italian' | 'japanese')[])
```

## Concepts

### Graph and Init

```ts
createGraph<Init>()(nodes)
```

`Init` is required — it shapes `ctx.initial` in every dynamic value
callback and edge predicate across the graph. Use `{}` if your flow
doesn't need initial values.

At construction time the graph is validated:
- First node must be `entry`, last must be `end`
- No duplicate node IDs
- All edge targets must reference existing nodes
- `otherwise()` edges must be last in the edge list
- Orphan nodes and unreachable terminal paths produce warnings

Invalid graphs throw a `GraphError` with code `VALIDATION_ERROR`.

### Nodes

| Factory | Role | Edges | Answer |
|---------|------|-------|--------|
| `entry(config)` | Graph entry point, ID `__entry__` | Yes | No |
| `question(config)` | Displays a question, collects typed answer | Yes | Yes |
| `result(config)` | Terminal with a title/description | No | No |
| `end()` | Terminal, ID `__end__` | No | No |
| `defineNodeType<Kind, Config, Answer>(...)` | Userland custom node kind | Yes | Optional |

`title` and `description` are **dynamic values** — either a static
string or `(ctx) => string` receiving `{ initial, answers }`.

### Questions

The core ships no built-in question types — `text`, `radio`, `nps`, etc.
live in userland. Declare them with `defineQuestionType`:

```ts
defineQuestionType<Kind, Config, Answer>(kind)
//  ^ curried: returns (config: Config) => QuestionDef<Kind, Config, Answer>
```

The three generic parameters define the runtime `kind` string, the shape
of the `config` object passed to each instance, and the type of the
answer collected by the engine. The answer type flows end-to-end —
`engine.getAnswer('q1')` is statically typed, edge predicates receive
`ctx.answer` typed to the question's answer type, and `ExtractAnswers`
includes the node in the graph's answer map.

### Edges

Three edge factories — all may target a string node ID:

```ts
edge(target)                                // unconditional
when(predicate, target)                     // conditional; sync or async
otherwise(target)                           // fallback, must be last
```

Predicates receive `{ initial, answers, answer }` and may be **sync or
async**:

```ts
when(({ answer }) => answer.length > 3, 'next')
when(async ({ initial }) => {
  const ok = await api.validate(initial);
  return ok;
}, 'next')
```

Edges are evaluated in order; the first matching edge wins. Async
predicates are awaited before the next edge is checked, so ordering is
preserved even in mixed sync/async lists.

### Engine

```ts
const engine = survey.start(initialValues);

engine.currentNode;       // current node definition
engine.status;            // 'active' | 'completed'
engine.answers;           // collected answers so far (Partial<Answers>)
engine.history;           // ordered list of visited node IDs

await engine.next();              // advance from non-question nodes (async)
await engine.submit(answer);      // submit answer for question nodes (async)

engine.back();                    // go to previous node (sync)
engine.jumpTo(nodeId);            // jump to a previously visited node (sync)
engine.canGoBack();               // true if back() is possible
engine.getAnswer('nodeId');       // typed answer for a specific node
engine.visitedNodes();            // list of visited node IDs
```

`next()` and `submit()` are async because they evaluate edge predicates,
which may be async. `back()` and `jumpTo()` only navigate already-visited
history and stay synchronous.

### Events

```ts
engine.on('nodeEnter', (node) => { /* entered a node */ });
engine.on('nodeExit',  (node, answer) => { /* leaving a node */ });
engine.on('complete',  (answers) => { /* traversal finished */ });
engine.on('error',     (error) => { /* GraphError occurred */ });
```

### Custom Node Types

Extend the graph with your own kinds via `defineNodeType`:

```ts
const consent = defineNodeType<'consent', { text: string }, boolean>({
  kind: 'consent',
});

// Use like any other node — first-class in the graph
consent({ id: 'gdpr', text: 'Accept policy?', edges: [edge('next')] });
```

The three type parameters are the literal `Kind`, the shape of extra
fields added to the node, and the `Answer` type this node collects (use
`undefined` — the default — for nodes that don't collect an answer).

## The `_answerType` Protocol

The library uses a single protocol to decide which nodes contribute to
the answer map: a node participates if and only if it declares
`_answerType` with a non-`undefined` type. This applies uniformly to:

- `question()` nodes (hoisted from `question._answerType`)
- Custom nodes from `defineNodeType<K, C, Answer>` with non-`undefined`
  `Answer`
- Any future node kind — just declare `_answerType` and it joins the map

`ExtractAnswers<typeof nodes>` produces `{ [id]: answerType }` covering
all such nodes, which drives the typing of `engine.answers`,
`engine.getAnswer(id)`, and `ctx.answers` inside dynamic value
callbacks.

## Serialization

Two independent mechanisms — pick whichever you need.

### Runtime state: `snapshot()` / `restore()`

Capture the engine's in-flight state as JSON-safe data and resume it
later — across page reloads, SSR dehydration, server handoffs, etc.

```ts
const engine = survey.start({ name: 'Alice', age: 30 });
await engine.next();
await engine.submit('developer');

const snap = engine.snapshot();
// { version: 1, currentNodeId, answers, history, status }
const json = JSON.stringify(snap);

// ... later, possibly in a different process ...

const restored = survey.restore(JSON.parse(json), { name: 'Alice', age: 30 });
await restored.submit(['japanese']);
```

The graph definition is the source of truth for structure/behavior; the
snapshot carries only runtime state. `restore()` validates that all node
IDs referenced by the snapshot exist in the graph.

### Graph definition: `serializeGraph` / `deserializeGraph`

Store the entire graph structure as JSON — useful for storing flows in
a database, building admin tools, generating graphs from external
sources, or diffing between versions.

Functions can't be serialized, so the library uses a DSL strategy: edge
predicates are stored as **Jexl**-style expression strings, dynamic
values as **JSONata**-style expression strings. The core stays
dependency-free — it exposes an `ExpressionAdapter` interface, and the
consumer wires in Jexl and JSONata (or any other evaluator) themselves.

To build a graph in code that survives serialization, use the
expression helpers:

```ts
import { entry, result, end } from 'qmcp-core';
import { expr, whenExpr } from 'qmcp-core';

entry({
  title: expr<string>("'Hi ' & initial.name"),
  edges: [
    whenExpr('initial.age >= 18', 'adult'),
    otherwise('minor'),
  ],
});
```

Plain lambdas (e.g. `when(ctx => ...)`) have no expression source and
are rejected by `serializeGraph` unless you opt into
`{ onFunction: 'omit' | 'placeholder' }`.

#### Serializing a graph

```ts
import { serializeGraph } from 'qmcp-core';

const spec = serializeGraph(graph);
// Shape: { version: 1, nodes: [ { _kind, id, title, edges, ... }, ... ] }
const json = JSON.stringify(spec);
```

#### Deserializing with Jexl + JSONata

```ts
import jexl from 'jexl';
import jsonata from 'jsonata';
import { deserializeGraph, type ExpressionAdapter } from 'qmcp-core';
import { text, radio, consent } from './survey-types';

const conditionAdapter: ExpressionAdapter<boolean> = {
  compile: (src) => {
    const compiled = jexl.compile(src);
    return (ctx) => compiled.evalSync(ctx);
  },
};

const dynamicAdapter: ExpressionAdapter<unknown> = {
  compile: (src) => {
    const compiled = jsonata(src);
    return (ctx) => compiled.evaluate(ctx);
  },
};

const graph = deserializeGraph<{ name: string; age: number }>(spec, {
  conditionAdapter,
  dynamicAdapter,
  questionTypes: { text, radio },            // kind -> factory
  nodeTypes:     { consent },                // custom _kind -> factory
});
```

After deserialization, the graph is fully operational — start it,
advance it, snapshot it, serialize it again. `serialize ∘ deserialize`
is structurally idempotent.

#### Combining both

```ts
const persisted = JSON.stringify({
  spec: serializeGraph(graph),
  snap: engine.snapshot(),
});

// ... later ...

const { spec, snap } = JSON.parse(persisted);
const graph  = deserializeGraph(spec, options);
const engine = graph.restore(snap, initialValues);
```

## Type Safety

### Edge targets checked at compile time

```ts
createGraph<{}>()([
  entry({ title: 'Hi', edges: [edge('nonexistent')] }), // TS error
  result({ id: 'done', title: 'Done' }),
  end(),
]);
// Type error on 'nonexistent': not a valid node ID
```

### Answer types flow end-to-end

The `_answerType` phantom propagates from question declarations into
`engine.getAnswer(id)`, `ctx.answers` in dynamic value callbacks, and
`ctx.answer` in edge predicates:

```ts
const slider = defineQuestionType<'slider', { min: number; max: number }, number>('slider');

question({
  id: 'rating',
  title: 'Rate',
  question: slider({ min: 0, max: 10 }),
  edges: [
    when<'high', number>(({ answer }) => answer > 7, 'high'),
    //   ^ answer is typed as number
    otherwise('low'),
  ],
})
```

### Init flows into callbacks

`createGraph<Init>()` threads `Init` into every `title` / `description`
callback via a mapped-type constraint, so `ctx.initial` is typed without
annotation.

## Testing

```bash
bun test
```

## API Surface

```ts
// Graph construction
createGraph<Init>()(nodes)
GraphDefinition<Init, Answers, NodeDef>

// Nodes
entry, question, result, end
defineNodeType<Kind, Config, Answer>({ kind })

// Questions
defineQuestionType<Kind, Config, Answer>(kind)

// Edges (sync or async predicates)
edge, when, otherwise

// Engine
engine.next(), engine.submit(answer)                  // Promise<void>
engine.back(), engine.jumpTo(id), engine.canGoBack()  // sync
engine.getAnswer(id), engine.visitedNodes()
engine.on(event, handler)
engine.snapshot()                                     // EngineSnapshot

// Serialization
serializeGraph(graph, { onFunction? })                // GraphSpec
deserializeGraph<Init>(spec, {
  conditionAdapter, dynamicAdapter,
  questionTypes, nodeTypes,
})                                                    // GraphDefinition
createGraphFromSpec = deserializeGraph                // alias

// Code-level DSL carriers (for serializable graphs)
expr<R>(source)
whenExpr(source, target)
readExpr(fn), compileExpressions(nodes, adapters)

// Types
QuestionDef, DynContext, DynamicValue, Awaitable
EdgeDef, EdgeContext, EdgeType
AnyNodeDef, EntryNodeDef, QuestionNodeDef, ResultNodeDef, EndNodeDef, CustomNodeDef
ExtractAnswers, ExtractNodeIds
EngineStatus, EngineEvent, EngineEventMap, EngineSnapshot
GraphSpec, NodeSpec, EdgeSpec, ExprSpec
ExpressionAdapter, DeserializeOptions
ValidationError, GraphError
```
