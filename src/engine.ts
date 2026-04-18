// src/engine.ts
import type {
  AnyNodeDef,
  EdgeContext,
  EngineStatus,
  EngineEventMap,
} from './types.js';
import { GraphError } from './types.js';

export class GraphEngine<Init, Answers, NodeDef extends AnyNodeDef = AnyNodeDef> {
  private _currentNode: NodeDef;
  private _answers: Record<string, unknown> = {};
  private _history: string[] = [];
  private _status: EngineStatus = 'active';
  private _listeners: Map<string, ((...args: any[]) => void)[]> = new Map();

  constructor(
    private readonly nodeMap: Map<string, NodeDef>,
    private readonly initialValues: Init,
  ) {
    const entryNode = nodeMap.get('__entry__');
    if (!entryNode) {
      throw new GraphError('NO_ENTRY', 'Graph has no entry node');
    }
    this._currentNode = entryNode;
    this._history.push(entryNode.id);
  }

  get currentNode(): NodeDef {
    return this._currentNode;
  }

  get answers(): Partial<Answers> {
    return { ...this._answers } as Partial<Answers>;
  }

  get history(): readonly NodeDef['id'][] {
    return [...this._history] as NodeDef['id'][];
  }

  get status(): EngineStatus {
    return this._status;
  }

  async next(): Promise<void> {
    this.assertActive();
    if (this._currentNode._kind === 'question') {
      throw new GraphError(
        'INVALID_OPERATION',
        `Cannot call next() on a question node "${this._currentNode.id}". Use submit() instead.`,
      );
    }
    await this.evaluateEdgesAndAdvance(undefined);
  }

  async submit(answer: unknown): Promise<void> {
    this.assertActive();
    if (this._currentNode._kind !== 'question') {
      throw new GraphError(
        'INVALID_OPERATION',
        `Cannot call submit() on a ${this._currentNode._kind} node "${this._currentNode.id}". Use next() instead.`,
      );
    }
    this._answers[this._currentNode.id] = answer;
    await this.evaluateEdgesAndAdvance(answer);
  }

  getAnswer<K extends keyof Answers & string>(nodeId: K): Answers[K] | undefined {
    return this._answers[nodeId] as Answers[K] | undefined;
  }

  canGoBack(): boolean {
    return this._history.length > 1 && this._status === 'active';
  }

  back(): void {
    this.assertActive();
    if (this._history.length <= 1) {
      throw new GraphError('CANNOT_GO_BACK', 'Already at the first node');
    }
    this._history.pop();
    const previousId = this._history[this._history.length - 1]!;
    const previousNode = this.nodeMap.get(previousId);
    if (!previousNode) {
      throw new GraphError('INVALID_TARGET', `Previous node "${previousId}" not found`);
    }
    this._currentNode = previousNode;
  }

  jumpTo(nodeId: NodeDef['id']): void {
    const index = this._history.indexOf(nodeId);
    if (index === -1) {
      throw new GraphError('NOT_VISITED', `Node "${nodeId}" has not been visited`);
    }
    const targetNode = this.nodeMap.get(nodeId);
    if (!targetNode) {
      throw new GraphError('INVALID_TARGET', `Node "${nodeId}" not found`);
    }
    if (targetNode._kind !== 'question') {
      this.assertActive();
    }
    this._history = this._history.slice(0, index + 1);
    this._currentNode = targetNode;
    this._status = 'active';
  }

  visitedNodes(): readonly NodeDef['id'][] {
    return [...this._history] as NodeDef['id'][];
  }

  on<E extends keyof EngineEventMap<Answers, NodeDef>>(
    event: E,
    handler: (...args: EngineEventMap<Answers, NodeDef>[E]) => void,
  ): void {
    const handlers = this._listeners.get(event as string) ?? [];
    handlers.push(handler as (...args: any[]) => void);
    this._listeners.set(event as string, handlers);
  }

  private assertActive(): void {
    if (this._status === 'completed') {
      throw new GraphError('COMPLETED', 'Graph traversal is already completed');
    }
  }

  private async evaluateEdgesAndAdvance(answer: unknown): Promise<void> {
    const node = this._currentNode;

    if (!('edges' in node)) {
      const err = new GraphError('NO_EDGES', `Node "${node.id}" has no edges`);
      this.emit('error', err);
      throw err;
    }

    const edges = (node as { edges: readonly { target: string; condition: (ctx: EdgeContext) => boolean | Promise<boolean> }[] }).edges;

    const ctx: EdgeContext = {
      initial: this.initialValues,
      answers: { ...this._answers } as Partial<Answers>,
      answer,
    };

    for (const e of edges) {
      // `await` handles both sync boolean and Promise<boolean> — a sync
      // predicate resolves immediately without yielding to the event loop
      // past the first await anchor, so the ordering guarantee (first
      // matching edge wins) is preserved.
      if (await e.condition(ctx)) {
        this.navigateTo(e.target);
        return;
      }
    }

    const err = new GraphError(
      'NO_MATCHING_EDGE',
      `No edge matched in node "${node.id}". Add an otherwise() fallback.`,
    );
    this.emit('error', err);
    throw err;
  }

  private navigateTo(targetId: string): void {
    const exitingNode = this._currentNode;
    const targetNode = this.nodeMap.get(targetId);

    if (!targetNode) {
      throw new GraphError('INVALID_TARGET', `Edge target "${targetId}" not found`);
    }

    this.emit('nodeExit', exitingNode, this._answers[exitingNode.id]);
    this._currentNode = targetNode;
    this._history.push(targetId);
    this.emit('nodeEnter', targetNode);

    if (targetNode._kind === 'result' || targetNode._kind === 'end') {
      this._status = 'completed';
      this.emit('complete', { ...this._answers } as Partial<Answers>);
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this._listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(...args);
    }
  }
}
