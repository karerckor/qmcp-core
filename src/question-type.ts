// src/question-type.ts
import type { QuestionDef } from './types.js';

/**
 * Factory for declaring a custom question type.
 *
 * The core library intentionally ships no built-in question types
 * (no `text`, `radio`, `nps`, etc.). Userland owns the domain:
 * consumers declare the question types their surveys need, using this
 * factory, and the graph/engine accept them uniformly via the
 * QuestionDef protocol.
 *
 * Usage example (userland):
 *
 *   interface TextConfig { placeholder?: string; required?: boolean }
 *   const text = defineQuestionType<'text', TextConfig, string>('text');
 *
 *   const q = text({ placeholder: 'Your name', required: true });
 *   //    ^? QuestionDef<'text', TextConfig, string>
 *
 * The `_answerType` field on the result is a phantom — it carries the
 * answer type through TypeScript (ExtractAnswers, edge predicates) but
 * is not meant to be read at runtime. Mirrors `defineNodeType`:
 * `undefined as Answer`.
 */
export function defineQuestionType<
  const Kind extends string,
  Config,
  Answer,
>(kind: Kind): (config: Config) => QuestionDef<Kind, Config, Answer> {
  return (config) => ({
    kind,
    config,
    _answerType: undefined as Answer,
  });
}
