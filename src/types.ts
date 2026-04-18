// src/types.ts

// ============================================================
// Question Protocol
// ============================================================

/** Any question factory must return an object matching this shape.
 *  The `_answerType` field is a phantom type — never read at runtime. */
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

/** Context passed to dynamic value functions (title, description, etc.) */
export interface DynContext<Init = any, Answers = any> {
  readonly initial: Init;
  readonly answers: Partial<Answers>;
}

/** A value that is either static or computed from context. */
export type DynamicValue<Init = any, Answers = any, R = string> =
  | R
  | ((ctx: DynContext<Init, Answers>) => R);

// ============================================================
// Edges
// ============================================================

/** Context passed to edge predicate functions. */
export interface EdgeContext<Init = any, Answers = any, Answer = any> {
  readonly initial: Init;
  readonly answers: Partial<Answers>;
  readonly answer: Answer;
}

/** Discriminated union tag for edge types. */
export type EdgeType = 'when' | 'otherwise' | 'edge';

/** An edge definition produced by when(), otherwise(), or edge().
 *  Answer type parameter enables typed predicates inside question nodes. */
export interface EdgeDef<Target extends string = string, Answer = unknown> {
  readonly _type: EdgeType;
  readonly target: Target;
  condition(ctx: EdgeContext<any, any, Answer>): boolean;
}

// ============================================================
// Node Definitions
// ============================================================

export interface WelcomeNodeDef<Edges extends readonly EdgeDef[] = readonly EdgeDef[]> {
  readonly _kind: 'welcome';
  readonly id: '__welcome__';
  readonly title: DynamicValue;
  readonly description?: DynamicValue;
  readonly edges: Edges;
}

export interface QuestionNodeDef<
  Id extends string = string,
  Q extends QuestionDef = QuestionDef,
  Edges extends readonly EdgeDef<string, Q['_answerType']>[] = readonly EdgeDef<string, Q['_answerType']>[],
> {
  readonly _kind: 'question';
  readonly id: Id;
  readonly title: DynamicValue;
  readonly description?: DynamicValue;
  readonly question: Q;
  readonly edges: Edges;
}

export interface ViewNodeDef<
  Id extends string = string,
  Edges extends readonly EdgeDef[] = readonly EdgeDef[],
> {
  readonly _kind: 'view';
  readonly id: Id;
  readonly title: DynamicValue;
  readonly description?: DynamicValue;
  readonly text: DynamicValue;
  readonly edges: Edges;
}

export interface ResultNodeDef<Id extends string = string> {
  readonly _kind: 'result';
  readonly id: Id;
  readonly title: DynamicValue;
  readonly description?: DynamicValue;
}

export interface EndNodeDef {
  readonly _kind: 'end';
  readonly id: '__end__';
}

/** Union of all possible node definitions. */
export type AnyNodeDef =
  | WelcomeNodeDef
  | QuestionNodeDef
  | ViewNodeDef
  | ResultNodeDef<string>
  | EndNodeDef;

// ============================================================
// Type Extraction Utilities
// ============================================================

/** Extract all node IDs from a tuple of nodes as a string literal union. */
export type ExtractNodeIds<Nodes extends readonly AnyNodeDef[]> =
  Nodes[number]['id'];

/** Extract `{ [questionId]: answerType }` map from a tuple of nodes. */
export type ExtractAnswers<Nodes extends readonly AnyNodeDef[]> = {
  [N in Extract<Nodes[number], { _kind: 'question' }> as N extends QuestionNodeDef<infer Id, any> ? Id : never]:
    N extends QuestionNodeDef<any, infer Q> ? Q['_answerType'] : never;
};

// ============================================================
// Graph-Level Type Constraints
// ============================================================

/** Extract all edge target strings from a single node. */
type EdgeTargetsOf<N> = N extends { edges: readonly EdgeDef<infer T, any>[] } ? T : never;

/** Mapped type that replaces invalid edge targets with error string types.
 *  When applied as a constraint on the node array parameter, TypeScript
 *  produces an error if any edge target doesn't match a known node ID.
 *  Nodes whose edge targets are erased to `string` (not literal) are
 *  skipped — compile-time validation only works with preserved literals. */
export type ValidateEdgeTargets<
  Nodes extends readonly AnyNodeDef[],
  ValidIds extends string = ExtractNodeIds<Nodes>,
> = {
  [K in keyof Nodes]:
    string extends EdgeTargetsOf<Nodes[K]>
      ? Nodes[K]  // edge targets erased to string — skip
      : EdgeTargetsOf<Nodes[K]> extends ValidIds
        ? Nodes[K]
        : Nodes[K] & { __error: `Edge target "${EdgeTargetsOf<Nodes[K]> & string}" is not a valid node ID` };
};

/** Mapped type that threads Init into DynamicValue callbacks.
 *  This enables contextual typing: title: ({ initial }) => initial.name
 *  gets initial typed as Init, not any. */
export type ConstrainDynamicValues<Init, Nodes extends readonly AnyNodeDef[]> = {
  [K in keyof Nodes]: Nodes[K] extends { title: DynamicValue<any, any, infer R> }
    ? Omit<Nodes[K], 'title' | 'description'> & {
        title: DynamicValue<Init, Record<string, unknown>, R>;
        description?: DynamicValue<Init, Record<string, unknown>, string>;
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

/** Maps each engine event to its handler argument tuple.
 *  `NodeDef` defaults to AnyNodeDef but narrows when the engine
 *  is created from a concrete graph definition. */
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
