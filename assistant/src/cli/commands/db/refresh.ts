/**
 * `assistant db refresh` — close and reopen all SQLite singleton connections
 * in the running daemon.
 *
 * Unlike `status` and `repair` (which open the DB file directly from disk),
 * `refresh` goes through IPC: it calls the daemon's `db_refresh` route, which
 * runs `resetDb()` followed by lazy reopens. This is the recovery path when a
 * database file has been replaced on disk while the daemon is running (e.g.
 * a corrupt `assistant-logs.db` was deleted and recreated) and the daemon's
 * cached file handle is now stale.
 */

import type { Command } from "commander";

import { cliIpcCall, exitFromIpcResult } from "../../../ipc/cli-client.js";
import { green, red } from "../../lib/cli-colors.js";
import { registerCommand } from "../../lib/register-command.js";
import { shouldOutputJson, writeOutput } from "../../output.js";

interface ConnectionResult {
  name: string;
  ok: boolean;
  error?: string;
}

interface RefreshResponse {
  ok: boolean;
  connections: ConnectionResult[];
}

export function registerDbRefresh(parent: Command): void {
  registerCommand(parent, {
    name: "refresh",
    transport: "ipc",
    description:
      "Close and reopen all SQLite database connections in the running daemon",
    build: (cmd) => {
      cmd.action(async function (this: Command) {
        const r = await cliIpcCall<RefreshResponse>("db_refresh");
        if (!r.ok) {
          return exitFromIpcResult(r);
        }

        const res = r.result!;

        if (shouldOutputJson(this)) {
          writeOutput(this, res);
          return;
        }

        for (const conn of res.connections) {
          const status = conn.ok
            ? green("ok")
            : red("error");
          let line = `  ${conn.name.padEnd(12)} ${status}`;
          if (conn.error) {
            line += `  ${conn.error}`;
          }
          process.stdout.write(line + "\n");
        }

        if (res.ok) {
          process.stdout.write(
            "\nAll database connections refreshed successfully.\n",
          );
        } else {
          process.stdout.write(
            "\nSome connections failed to reopen. Check errors above.\n",
          );
          process.exit(1);
        }
      });
    },
  });
}
