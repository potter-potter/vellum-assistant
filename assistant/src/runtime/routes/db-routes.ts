/**
 * Route definitions for in-process database connection management.
 *
 * POST /v1/db/refresh — close and reopen all SQLite singleton connections.
 *
 * The daemon caches SQLite connections in process-level singletons
 * (`db-connection.ts`). If a database file is replaced on disk while the
 * daemon is running (e.g. corrupt file deleted and recreated, manual
 * restore, hot-swap during debugging), the daemon keeps its stale file
 * handle and every read/write against it fails with `SQLITE_CORRUPT` until
 * the process restarts. This route lets the CLI trigger a clean close +
 * reopen without a full daemon restart.
 *
 * `resetDb()` closes all four singletons (main, logs, memory, telemetry).
 * The subsequent `getDb()` / `getLogsDb()` / etc. calls lazily reopen them
 * against the current files on disk. If any reopen fails, the route
 * reports which connection failed but still returns 200 with the error
 * detail so the caller can see the full picture.
 */

import { z } from "zod";

import {
  getDb,
  getLogsDb,
  getMemoryDb,
  getTelemetryDb,
  resetDb,
} from "../../persistence/db-connection.js";
import { ACTOR_PRINCIPALS } from "../auth/route-policy.js";
import type { RouteDefinition, RouteHandlerArgs } from "./types.js";

// ---------------------------------------------------------------------------
// POST /v1/db/refresh
// ---------------------------------------------------------------------------

interface ConnectionResult {
  name: string;
  ok: boolean;
  error?: string;
}

async function handleDbRefresh(
  _args: RouteHandlerArgs,
): Promise<Record<string, unknown>> {
  // Close all singleton connections.
  resetDb();

  // Reopen each one. Failures are collected, not thrown, so the caller
  // gets a full picture of which connections recovered and which didn't.
  const connections: ConnectionResult[] = [];

  for (const [name, opener] of [
    ["main", () => getDb()],
    ["logs", () => getLogsDb()],
    ["memory", () => getMemoryDb()],
    ["telemetry", () => getTelemetryDb()],
  ] as const) {
    try {
      opener();
      connections.push({ name, ok: true });
    } catch (err) {
      connections.push({
        name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = connections.every((c) => c.ok);

  return {
    ok: allOk,
    connections,
  };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const refreshResponseSchema = z.object({
  ok: z.boolean(),
  connections: z.array(
    z.object({
      name: z.string(),
      ok: z.boolean(),
      error: z.string().optional(),
    }),
  ),
});

export const ROUTES: RouteDefinition[] = [
  {
    operationId: "db_refresh",
    endpoint: "db/refresh",
    method: "POST",
    policy: {
      requiredScopes: ["settings.write"],
      allowedPrincipalTypes: ACTOR_PRINCIPALS,
    },
    summary: "Close and reopen all SQLite database connections",
    description:
      "Closes the daemon's cached SQLite singletons (main, logs, memory, telemetry) and reopens them against the current files on disk. Use after replacing a corrupt or restored database file while the daemon is running.",
    tags: ["system"],
    handler: handleDbRefresh,
    responseBody: refreshResponseSchema,
  },
];
