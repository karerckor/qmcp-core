// src/node.ts
import type {
  DynamicValue,
  EdgeDef,
  QuestionDef,
  EntryNodeDef,
  QuestionNodeDef,
  ResultNodeDef,
  EndNodeDef,
  CustomNodeDef,
} from './types.js';

// ---- Entry (graph starting point) ----

interface EntryConfig<Edges extends readonly EdgeDef[]> {
  title: DynamicValue;
  description?: DynamicValue;
  edges: [...Edges];
}

export function entry<const Edges extends readonly EdgeDef[]>(
  config: EntryConfig<Edges>,
): EntryNodeDef<Edges> {
  return { _kind: 'entry', id: '__entry__', ...config } as EntryNodeDef<Edges>;
}

// ---- Question ----

interface QuestionConfig<Id extends string, Q extends QuestionDef> {
  id: Id;
  title: DynamicValue;
  description?: DynamicValue;
  question: Q;
  edges: readonly EdgeDef<string, Q['_answerType']>[];
}

export function question<const Id extends string, Q extends QuestionDef>(
  config: QuestionConfig<Id, Q>,
): QuestionNodeDef<Id, Q> {
  return {
    _kind: 'question',
    ...config,
    // Hoist the inner question's phantom to the node level so
    // QuestionNodeDef and CustomNodeDef share a single `_answerType`
    // contract — which is what ExtractAnswers keys off of.
    _answerType: config.question._answerType,
  } as QuestionNodeDef<Id, Q>;
}

// ---- Result ----

interface ResultConfig<Id extends string> {
  id: Id;
  title: DynamicValue;
  description?: DynamicValue;
}

export function result<const Id extends string>(
  config: ResultConfig<Id>,
): ResultNodeDef<Id> {
  return { _kind: 'result', ...config };
}

// ---- End ----

export function end(): EndNodeDef {
  return { _kind: 'end', id: '__end__' };
}

// ---- Custom Node Type ----

/** Creates a factory for a new node kind. Nodes produced by the returned
 *  factory are first-class: they are assignable to AnyNodeDef, their edges
 *  are type-validated against the graph's node IDs, and they participate in
 *  ExtractAnswers when `Answer` is not `undefined`. */
export function defineNodeType<
  const Kind extends string,
  Config extends object,
  Answer = undefined,
>(options: { kind: Kind }) {
  return <const Id extends string, const Edges extends readonly EdgeDef<string, Answer>[]>(
    config: { id: Id; edges: [...Edges] } & Config,
  ): CustomNodeDef<Kind, Id, Answer, Edges> & Config => {
    return {
      _kind: options.kind,
      _answerType: undefined as Answer,
      ...config,
    } as CustomNodeDef<Kind, Id, Answer, Edges> & Config;
  };
}
