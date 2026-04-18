// src/test-utils.ts
//
// Userland declarations used across tests. The core library ships no
// built-in question types or node kinds beyond entry/question/result/end;
// this file shows the pattern a library consumer would follow in their
// own code.

import type { DynamicValue, QuestionDef } from './types.js';
import { defineQuestionType } from './question-type.js';
import { defineNodeType } from './node.js';

// ---- Userland question types ----

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

export const text = defineQuestionType<'text', TextConfig, string>('text');

export function radio<const T>(
  config: RadioConfig<T>,
): QuestionDef<'radio', RadioConfig<T>, T> {
  return defineQuestionType<'radio', RadioConfig<T>, T>('radio')(config);
}

export function checkbox<const T>(
  config: CheckboxConfig<T>,
): QuestionDef<'checkbox', CheckboxConfig<T>, T[]> {
  return defineQuestionType<'checkbox', CheckboxConfig<T>, T[]>('checkbox')(config);
}

export const nps = defineQuestionType<'nps', NpsConfig, number>('nps');

// ---- Userland "view" node (not part of core) ----

interface ViewFields {
  title: DynamicValue;
  description?: DynamicValue;
  text: DynamicValue;
}

export const view = defineNodeType<'view', ViewFields>({ kind: 'view' });
