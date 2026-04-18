// src/node.ts
import type {
  DynamicValue,
  EdgeDef,
  QuestionDef,
  WelcomeNodeDef,
  QuestionNodeDef,
  ViewNodeDef,
  ResultNodeDef,
  EndNodeDef,
} from './types.js';

// ---- Welcome ----

interface WelcomeConfig<Edges extends readonly EdgeDef[]> {
  title: DynamicValue;
  description?: DynamicValue;
  edges: [...Edges];
}

export function welcome<const Edges extends readonly EdgeDef[]>(
  config: WelcomeConfig<Edges>,
): WelcomeNodeDef<Edges> {
  return { _kind: 'welcome', id: '__welcome__', ...config } as WelcomeNodeDef<Edges>;
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
  return { _kind: 'question', ...config } as QuestionNodeDef<Id, Q>;
}

// ---- View ----

interface ViewConfig<Id extends string, Edges extends readonly EdgeDef[]> {
  id: Id;
  title: DynamicValue;
  description?: DynamicValue;
  text: DynamicValue;
  edges: [...Edges];
}

export function view<const Id extends string, const Edges extends readonly EdgeDef[]>(
  config: ViewConfig<Id, Edges>,
): ViewNodeDef<Id, Edges> {
  return { _kind: 'view', ...config } as ViewNodeDef<Id, Edges>;
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

interface CustomNodeDef<Kind extends string, Id extends string, Answer> {
  readonly _kind: Kind;
  readonly id: Id;
  readonly edges: readonly EdgeDef[];
  readonly _answerType: Answer;
}

export function defineNodeType<Config extends Record<string, unknown>, Answer = undefined>(
  options: { kind: string },
) {
  return <const Id extends string>(
    config: { id: Id; edges: readonly EdgeDef[] } & Config,
  ): CustomNodeDef<string, Id, Answer> & Config => {
    return {
      _kind: options.kind,
      _answerType: undefined as Answer,
      ...config,
    } as CustomNodeDef<string, Id, Answer> & Config;
  };
}
