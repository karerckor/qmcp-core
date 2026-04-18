// src/question.ts
import type { QuestionDef } from './types.js';

// ---- Config types ----

export interface TextConfig {
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly required?: boolean;
}

export interface Option<T = unknown> {
  readonly label: string;
  readonly value: T;
}

export interface RadioConfig<T = unknown> {
  readonly options: readonly Option<T>[];
}

export interface CheckboxConfig<T = unknown> {
  readonly options: readonly Option<T>[];
}

export interface NpsConfig {
  readonly min: number;
  readonly max: number;
  readonly labels?: readonly string[];
}

// ---- Factory functions ----

export function text(config: TextConfig): QuestionDef<'text', TextConfig, string> {
  return { kind: 'text', config, _answerType: '' as string };
}

export function radio<T>(config: RadioConfig<T>): QuestionDef<'radio', RadioConfig<T>, T> {
  return { kind: 'radio', config, _answerType: undefined as T };
}

export function checkbox<T>(config: CheckboxConfig<T>): QuestionDef<'checkbox', CheckboxConfig<T>, T[]> {
  return { kind: 'checkbox', config, _answerType: [] as T[] };
}

export function nps(config: NpsConfig): QuestionDef<'nps', NpsConfig, number> {
  return { kind: 'nps', config, _answerType: 0 as number };
}
