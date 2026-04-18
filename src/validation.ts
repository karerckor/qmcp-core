// src/validation.ts
import type { AnyNodeDef, ValidationError } from './types.js';

export function validateGraph(nodes: readonly AnyNodeDef[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (nodes.length === 0) {
    errors.push({ code: 'EMPTY_GRAPH', message: 'Graph has no nodes', severity: 'error' });
    return errors;
  }

  // ENTRY_POSITION
  if (nodes[0]!._kind !== 'entry') {
    errors.push({
      code: 'ENTRY_POSITION',
      message: 'First node must be an entry node',
      severity: 'error',
    });
  }

  // END_POSITION
  if (nodes[nodes.length - 1]!._kind !== 'end') {
    errors.push({
      code: 'END_POSITION',
      message: 'Last node must be an end node',
      severity: 'error',
    });
  }

  // Collect all node IDs
  const nodeIds = new Set<string>();
  const duplicateCheck = new Map<string, number>();

  for (const node of nodes) {
    const count = duplicateCheck.get(node.id) ?? 0;
    duplicateCheck.set(node.id, count + 1);
    nodeIds.add(node.id);
  }

  // DUPLICATE_ID
  for (const [id, count] of duplicateCheck) {
    if (count > 1) {
      errors.push({
        code: 'DUPLICATE_ID',
        nodeId: id,
        message: `Duplicate node id: "${id}" appears ${count} times`,
        severity: 'error',
      });
    }
  }

  // Collect all edge targets and check MISSING_TARGET + OTHERWISE_POSITION
  const incomingEdges = new Set<string>();

  for (const node of nodes) {
    if (!('edges' in node)) continue;
    const edges = (node as { edges: readonly { _type: string; target: string }[] }).edges;

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i]!;

      // MISSING_TARGET
      if (!nodeIds.has(e.target)) {
        errors.push({
          code: 'MISSING_TARGET',
          nodeId: node.id,
          edgeIndex: i,
          message: `Edge in node "${node.id}" targets non-existent node "${e.target}"`,
          severity: 'error',
        });
      } else {
        incomingEdges.add(e.target);
      }

      // OTHERWISE_POSITION
      if (e._type === 'otherwise' && i !== edges.length - 1) {
        errors.push({
          code: 'OTHERWISE_POSITION',
          nodeId: node.id,
          edgeIndex: i,
          message: `"otherwise" edge in node "${node.id}" must be the last edge`,
          severity: 'error',
        });
      }
    }
  }

  // ORPHAN_NODE (warning) — skip entry and end
  for (const node of nodes) {
    if (node._kind === 'entry' || node._kind === 'end') continue;
    if (!incomingEdges.has(node.id)) {
      errors.push({
        code: 'ORPHAN_NODE',
        nodeId: node.id,
        message: `Node "${node.id}" has no incoming edges`,
        severity: 'warning',
      });
    }
  }

  // NO_TERMINAL_PATH (warning) — BFS from entry to check reachability to terminal
  const terminalIds = new Set<string>();
  for (const node of nodes) {
    if (node._kind === 'result' || node._kind === 'end') {
      terminalIds.add(node.id);
    }
  }

  if (terminalIds.size > 0) {
    const edgeMap = new Map<string, string[]>();
    for (const node of nodes) {
      if (!('edges' in node)) continue;
      const edges = (node as { edges: readonly { target: string }[] }).edges;
      edgeMap.set(node.id, edges.map((e) => e.target));
    }

    const visited = new Set<string>();
    const queue: string[] = ['__entry__'];
    let reachesTerminal = false;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (terminalIds.has(current)) {
        reachesTerminal = true;
        break;
      }

      const targets = edgeMap.get(current) ?? [];
      for (const t of targets) {
        if (!visited.has(t)) queue.push(t);
      }
    }

    if (!reachesTerminal) {
      errors.push({
        code: 'NO_TERMINAL_PATH',
        message: 'No path from entry reaches a result or end node',
        severity: 'warning',
      });
    }
  }

  return errors;
}
