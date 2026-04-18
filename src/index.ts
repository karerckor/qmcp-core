// src/index.ts

// Graph construction
export { createGraph } from './graph.js';
export { GraphDefinition } from './graph.js';

// Node factories
export { welcome, question, view, result, end, defineNodeType } from './node.js';

// Edge helpers
export { when, otherwise, edge } from './edge.js';

// Reference question types
export { text, radio, checkbox, nps } from './question.js';

// Types
export type {
  QuestionDef,
  DynamicValue,
  DynContext,
  EdgeDef,
  EdgeContext,
  AnyNodeDef,
  WelcomeNodeDef,
  QuestionNodeDef,
  ViewNodeDef,
  ResultNodeDef,
  EndNodeDef,
  ExtractAnswers,
  ExtractNodeIds,
  ValidationError,
  EngineStatus,
  EngineEvent,
  EngineEventMap,
} from './types.js';

export { GraphError } from './types.js';
export { GraphEngine } from './engine.js';

// Question config types
export type {
  TextConfig,
  RadioConfig,
  CheckboxConfig,
  NpsConfig,
  Option,
} from './question.js';
