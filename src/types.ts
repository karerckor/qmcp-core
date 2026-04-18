// src/types.ts

// ============================================================
// Question Protocol
// ============================================================

/** Any question factory must return an object matching this shape.
 *  `_answerType` is a phantom field — it exists purely to carry the answer
 *  type through the type system (ExtractAnswers, edge predicates). It is
 *  never read at runtime. */
export interface QuestionDef<
  Kind extends string = string,
  Config = unknown,
  Answer = unknown,
> {
  readonly kind: Kind;
  readonly config: Config;
  readonly _answerType: Answer;
}

// ============================================================
// Dynamic Values
// ============================================================

/** Context passed to dynamic value callbacks (title, description, etc.). */
export interface DynContext<Init = any, Answers = any> {
  readonly initial: Init;
  readonly answers: Partial<Answers>;
}

/** A value that is either static or computed from context.
 *
 *  Defaults are `any` by intent: node factories (entry/question/...) are
 *  called *before* the array reaches createGraph, so TS can't yet infer
 *  `Init`/`Answers` at that point. Real typing is applied later by
 *  `ConstrainDynamicValues` inside `createGraph`, which rewrites every
 *  DynamicValue callback signature to use the graph's Init and
 *  ExtractAnswers<Nodes>. */
export type DynamicValue<Init = any, Answers = any, R = string> =
  | R
  | ((ctx: DynContext<Init, Answers>) => R);

// ============================================================
// Edges
// ============================================================

/** A value that is either immediate or a Promise of it. Used so edge
 *  predicates can be either sync or async transparently. */
export type Awaitable<T> = T | Promise<T>;

/** Context passed to edge predicate functions. */
export interface EdgeContext<Init = unknown, Answers = unknown, Answer = unknown> {
  readonly initial: Init;
  readonly answers: Partial<Answers>;
  readonly answer: Answer;
}

export type EdgeType = 'when' | 'otherwise' | 'edge';

/** An edge definition produced by when(), otherwise(), or edge().
 *  `condition` may be sync or async — the engine awaits each result in
 *  order, so `next()`/`submit()` return a Promise. */
export interface EdgeDef<Target extends string = string, Answer = unknown> {
  readonly _type: EdgeType;
  readonly target: Target;
  condition(ctx: EdgeContext<unknown, unknown, Answer>): Awaitable<boolean>;
}

// ============================================================
// Node Definitions
// ============================================================

/** Minimal structural constraint every node must satisfy.
 *  All built-in nodes (entry/question/result/end) AND any custom node
 *  produced by `defineNodeType` extend this — so `AnyNodeDef` is an open
 *  upper bound, not a closed union. This is what makes the library
 *  extensible: users can declare new node kinds that fit the graph without
 *  touching core. */
export interface AnyNodeDef {
  readonly _kind: string;
  readonly id: string;
}

export interface EntryNodeDef<
  Edges extends readonly EdgeDef[] = readonly EdgeDef[],
> extends AnyNodeDef {
  readonly _kind: 'entry';
  readonly id: '__entry__';
  readonly title: DynamicValue;
  readonly description?: DynamicValue;
  readonly edges: Edges;
}

export interface QuestionNodeDef<
  Id extends string = string,
  Q extends QuestionDef = QuestionDef,
  Edges extends readonly EdgeDef<string, Q['_answerType']>[] = readonly EdgeDef<string, Q['_answerType']>[],
> extends AnyNodeDef {
  readonly _kind: 'question';
  readonly id: Id;
  readonly title: DynamicValue;
  readonly description?: DynamicValue;
  readonly question: Q;
  readonly edges: Edges;
  /** Hoisted from `question._answerType` so that every answer-carrying node
   *  — builtin or custom — exposes the same `_answerType` contract. This is
   *  what lets `ExtractAnswers` be a single uniform mapped type. */
  readonly _answerType: Q['_answerType'];
}

export interface ResultNodeDef<Id extends string = string> extends AnyNodeDef {
  readonly _kind: 'result';
  readonly id: Id;
  readonly title: DynamicValue;
  readonly description?: DynamicValue;
}

export interface EndNodeDef extends AnyNodeDef {
  readonly _kind: 'end';
  readonly id: '__end__';
}

/** Custom node produced by `defineNodeType`. Participates in ExtractAnswers
 *  when `Answer` is not `undefined`. */
export interface CustomNodeDef<
  Kind extends string = string,
  Id extends string = string,
  Answer = undefined,
  Edges extends readonly EdgeDef<string, Answer>[] = readonly EdgeDef<string, Answer>[],
> extends AnyNodeDef {
  readonly _kind: Kind;
  readonly id: Id;
  readonly edges: Edges;
  readonly _answerType: Answer;
}

// ============================================================
// Type Extraction Utilities
// ============================================================

/** Extract all node IDs from a tuple of nodes as a string literal union. */
export type ExtractNodeIds<Nodes extends readonly AnyNodeDef[]> =
  Nodes[number]['id'];

/** Internal: answer type carried by a node (or `never` if none). */
type AnswerOf<N> = N extends { readonly _answerType: infer A } ? A : never;

/** Internal: true when `A` is exactly `undefined`. The tuple wrap prevents
 *  distribution over unions (so `boolean | undefined` isn't split). */
type IsUndefined<A> = [A] extends [undefined] ? true : false;

/** Extract `{ [nodeId]: answerType }` map from a tuple of nodes.
 *
 *  The library exposes a single, uniform protocol for participating in
 *  the answer map: a node carries `_answerType` as a phantom field, and
 *  any non-`undefined` phantom promotes that node into the map under its
 *  `id` as key.
 *
 *  This makes the extension story trivial:
 *    - `defineNodeType<Kind, Config, Answer>` nodes → `_answerType: Answer`
 *    - `QuestionNodeDef` nodes                     → `_answerType: Q['_answerType']`
 *    - Any future node kind just needs to declare `_answerType` to
 *      automatically join the answer map — no edits to this type needed.
 *
 *  Entry/result/end and nodes declared with `Answer = undefined` are
 *  excluded because they carry no answer. */
export type ExtractAnswers<Nodes extends readonly AnyNodeDef[]> = {
  [N in Extract<Nodes[number], { readonly _answerType: unknown }> as
    IsUndefined<AnswerOf<N>> extends true ? never : N['id']
  ]: AnswerOf<N>;
};

// ============================================================
// Graph-Level Type Constraints
// ============================================================

/** Extract all edge target strings from a single node. */
type EdgeTargetsOf<N> = N extends { edges: readonly EdgeDef<infer T, any>[] } ? T : never;

/** Mapped type that replaces invalid edge targets with error string types.
 *  When applied as a constraint on the node array parameter, TypeScript
 *  produces an error if any edge target doesn't match a known node ID. */
export type ValidateEdgeTargets<
  Nodes extends readonly AnyNodeDef[],
  ValidIds extends string = ExtractNodeIds<Nodes>,
> = {
  [K in keyof Nodes]:
    string extends EdgeTargetsOf<Nodes[K]>
      ? Nodes[K]
      : EdgeTargetsOf<Nodes[K]> extends ValidIds
        ? Nodes[K]
        : Nodes[K] & { __error: `Edge target "${EdgeTargetsOf<Nodes[K]> & string}" is not a valid node ID` };
};

/** Threads the graph-level `Init` and `Answers` into every node's DynamicValue
 *  callbacks (title, description). Without this mapped constraint, the
 *  callbacks would see `ctx.initial: unknown` and `ctx.answers: unknown`. */
export type ConstrainDynamicValues<
  Init,
  Answers,
  Nodes extends readonly AnyNodeDef[],
> = {
  [K in keyof Nodes]: Nodes[K] extends { title: DynamicValue<any, any, infer R> }
    ? Omit<Nodes[K], 'title' | 'description'> & {
        title: DynamicValue<Init, Answers, R>;
        description?: DynamicValue<Init, Answers, string>;
      }
    : Nodes[K];
};

// ============================================================
// Validation
// ============================================================

export interface ValidationError {
  readonly code: string;
  readonly nodeId?: string;
  readonly edgeIndex?: number;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

// ============================================================
// Engine
// ============================================================

export type EngineStatus = 'active' | 'completed';

export type EngineEvent = 'nodeEnter' | 'nodeExit' | 'complete' | 'error';

/** Maps each engine event to its handler argument tuple. */
export interface EngineEventMap<Answers, NodeDef extends AnyNodeDef = AnyNodeDef> {
  nodeEnter: [node: NodeDef];
  nodeExit: [node: NodeDef, answer: unknown];
  complete: [answers: Partial<Answers>];
  error: [error: GraphError];
}

export class GraphError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}
