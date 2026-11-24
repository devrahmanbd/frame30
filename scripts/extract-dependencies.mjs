#!/usr/bin/env node
/**
 * Frame30 DICE Multi-Surface Dependency Extractor (Revision 2.3 Section 5)
 * Deterministically constructs graph G=(V,E) across 12 architectural surfaces.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

export const ARCHITECTURAL_SURFACES = [
  "typescript_module",
  "server_function",
  "database_schema",
  "rls_policy",
  "sql_trigger",
  "dynamic_route",
  "theme_catalog",
  "cron_job",
  "global_css",
  "builder_ast",
  "message_queue",
  "external_api"
];

// Helper to extract edges from a single file content
export function extractFileEdges(filePath, content) {
  const edges = [];
  const dir = dirname(filePath);

  // 1. TypeScript Modules (Imports)
  const importRegex = /(?:import|export)\s+(?:(?:\{[^}]*\}|\*\s+as\s+[^,]+|[^,]+)\s+from\s+)?["']([^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    let importTarget = match[1];
    if (importTarget.startsWith(".")) {
      // Normalize relative path
      let resolved = importTarget;
      if (resolved.startsWith("./")) resolved = resolved.slice(2);
      if (!resolved.endsWith(".ts") && !resolved.endsWith(".tsx")) {
        resolved = resolved + ".ts";
      }
      edges.push({
        source: filePath,
        target: resolved,
        surface: "typescript_module",
      });
    }
  }

  // 2. Server Functions (*.server.ts)
  if (filePath.endsWith(".server.ts") || content.includes("createServerFn")) {
    edges.push({
      source: filePath,
      target: "server_rpc_boundary",
      surface: "server_function",
    });
  }

  // 3. Database Schema (CREATE TABLE / ALTER TABLE)
  const tableRegex = /(?:CREATE|ALTER)\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_.]+)/gi;
  while ((match = tableRegex.exec(content)) !== null) {
    edges.push({
      source: filePath,
      target: `table:${match[1]}`,
      surface: "database_schema",
    });
  }

  // 4. RLS Policies (CREATE POLICY / ENABLE ROW LEVEL SECURITY)
  const policyRegex = /CREATE\s+POLICY\s+([a-zA-Z0-9_]+)\s+ON\s+([a-zA-Z0-9_.]+)/gi;
  while ((match = policyRegex.exec(content)) !== null) {
    edges.push({
      source: filePath,
      target: `policy:${match[1]}:on:${match[2]}`,
      surface: "rls_policy",
    });
  }

  // 5. SQL Trigger / Function
  const triggerRegex = /CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)\s+AFTER\s+INSERT\s+ON\s+([a-zA-Z0-9_.]+)/gi;
  while ((match = triggerRegex.exec(content)) !== null) {
    edges.push({
      source: filePath,
      target: `trigger:${match[1]}:on:${match[2]}`,
      surface: "sql_trigger",
    });
  }

  // 6. Dynamic Routes
  const routeRegex = /createFileRoute\(["']([^"']+)["']\)/g;
  while ((match = routeRegex.exec(content)) !== null) {
    edges.push({
      source: filePath,
      target: `route:${match[1]}`,
      surface: "dynamic_route",
    });
  }

  // 7. Theme Catalog
  if (content.includes("catalog =") || filePath.includes("catalog.ts")) {
    const sectionRegex = /sections:\s*\[([^\]]+)\]/g;
    const secMatch = sectionRegex.exec(content);
    if (secMatch) {
      edges.push({
        source: filePath,
        target: "theme:catalog:sections",
        surface: "theme_catalog",
      });
    }
  }

  // 8. Cron Jobs
  if (content.includes("cron:") || filePath.includes("cron")) {
    edges.push({
      source: filePath,
      target: "scheduler:crontab",
      surface: "cron_job",
    });
  }

  // 9. Global CSS Cascade
  if (filePath.endsWith(".css") || content.includes("@tailwind")) {
    edges.push({
      source: filePath,
      target: "style:global_cascade",
      surface: "global_css",
    });
  }

  // 10. Builder AST
  if (content.includes("SectionAst") || content.includes("WidgetAst") || filePath.includes("builder-ast")) {
    edges.push({
      source: filePath,
      target: "schema:builder_ast",
      surface: "builder_ast",
    });
  }

  // 11. Message Queue
  const queueRegex = /eventBus\.(?:subscribe|emit)\s*\(["']([^"']+)["']/g;
  while ((match = queueRegex.exec(content)) !== null) {
    edges.push({
      source: filePath,
      target: `queue:${match[1]}`,
      surface: "message_queue",
    });
  }

  // 12. External API
  if (content.includes("handleStripeWebhook") || content.includes("webhook")) {
    edges.push({
      source: filePath,
      target: "api:external:webhook",
      surface: "external_api",
    });
  }

  return edges;
}

export function buildDependencyGraph(fileMap) {
  const vertices = new Set(Object.keys(fileMap));
  const edges = [];
  const adjacency = new Map(); // vertex -> Set<vertex>

  for (const f of vertices) {
    adjacency.set(f, new Set());
  }

  for (const [filePath, content] of Object.entries(fileMap)) {
    if (content === null || content === undefined) {
      throw new Error(`[dependency-extractor] FAIL-CLOSED: Unparseable file: ${filePath}`);
    }
    const fileEdges = extractFileEdges(filePath, content);
    for (const e of fileEdges) {
      edges.push(e);
      if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
      adjacency.get(e.source).add(e.target);
      vertices.add(e.target);
      if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    }
  }

  return {
    vertices: Array.from(vertices),
    edges,
    adjacency,
  };
}

// Dual-Graph Traversal Algorithm (Revision 2.3 Section 5.3)
export function computeImpactClosure(modifiedFiles, baseGraph, candGraph) {
  // Check for unparseable / escalation errors
  if (!baseGraph || !candGraph) {
    throw new Error("[dependency-extractor] FAIL-CLOSED: Base or Candidate graph missing; escalates to BLOCKED");
  }

  // Edge key helper
  const edgeKey = (e) => `${e.source}-->${e.target}::${e.surface}`;
  const candEdgeKeys = new Set(candGraph.edges.map(edgeKey));

  // Compute deleted edges: E_base \ E_cand
  const deletedEdges = baseGraph.edges.filter((e) => !candEdgeKeys.has(edgeKey(e)));

  const impactedRoots = new Set(modifiedFiles);

  // Deleted edges trigger impact on both source and target
  for (const del of deletedEdges) {
    impactedRoots.add(del.source);
    impactedRoots.add(del.target);
  }

  // Construct Union Graph: G_union = G_base U G_cand
  const unionAdj = new Map();
  const addAdj = (u, v) => {
    if (!unionAdj.has(u)) unionAdj.set(u, new Set());
    unionAdj.get(u).add(v);
  };

  for (const e of [...baseGraph.edges, ...candGraph.edges]) {
    addAdj(e.source, e.target);
    addAdj(e.target, e.source); // Bidirectional dependency reachability
  }

  // BFS / DFS Reachability Closure
  const closure = new Set();
  const queue = Array.from(impactedRoots);

  while (queue.length > 0) {
    const curr = queue.shift();
    if (!closure.has(curr)) {
      closure.add(curr);
      const neighbors = unionAdj.get(curr) || new Set();
      for (const n of neighbors) {
        if (!closure.has(n)) {
          queue.push(n);
        }
      }
    }
  }

  return {
    impactedRoots: Array.from(impactedRoots),
    deletedEdges,
    impactClosure: Array.from(closure).sort(),
  };
}
