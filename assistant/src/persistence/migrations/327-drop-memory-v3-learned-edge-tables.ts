import type { DrizzleDb } from "../db-connection.js";

/**
 * Drops `memory_v3_coactivation` and `memory_v3_auto_edges`. Both belonged to
 * the retired memory-v3 edge-learning subsystem: coactivation was the
 * append-only pass-1 → pass-N co-activation log it consumed, auto_edges the
 * learned association graph it produced. The v3 rip removed the emitter, the
 * edge-learning job handler (`memory_v3_edge_learning` now sits in the
 * jobs-worker's retired-type drop list), and every reader — the tables only
 * grow the main DB with rows nothing will ever consult.
 *
 * Idempotent: DROP TABLE IF EXISTS (indexes are dropped with the tables).
 */
export function migrateDropMemoryV3LearnedEdgeTables(
  database: DrizzleDb,
): void {
  database.run(/*sql*/ `DROP TABLE IF EXISTS memory_v3_coactivation`);
  database.run(/*sql*/ `DROP TABLE IF EXISTS memory_v3_auto_edges`);
}
