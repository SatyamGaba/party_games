import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { log } from "../lib/log";
let db: DatabaseSync | undefined;
function database() {
  if (!db) {
    const directory = process.env.DATA_DIR ?? "data";
    mkdirSync(directory, { recursive: true });
    db = new DatabaseSync(join(directory, "party.sqlite"));
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS round_results (instance TEXT NOT NULL, room TEXT NOT NULL, round INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(instance, round))",
    );
  }
  return db;
}
export function saveRound(
  instance: string,
  room: string,
  round: number,
  result: unknown,
) {
  try {
    database()
      .prepare(
        "INSERT OR IGNORE INTO round_results(instance,room,round,result_json) VALUES(?,?,?,?)",
      )
      .run(instance, room, round, JSON.stringify(result));
  } catch {
    log("persistence_failed", { room, round });
  }
}
export function closeDatabase() {
  db?.close();
  db = undefined;
}
