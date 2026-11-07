import { createPartyServer } from "../platform/server/create-server";
import { serverGames } from "../games/registry.server";
import { closeDatabase } from "../storage/database";
import { log } from "../lib/log";
import { packMediaRouter } from "../games/fastest-finger-first/packs";
const { server } = createPartyServer(serverGames, [packMediaRouter()]);
const port = Number(process.env.PORT ?? 3000);
await server.listen(port, "0.0.0.0");
log("server_ready", { port });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  log("server_stopping");
  await server.gracefullyShutdown(false);
  closeDatabase();
}
process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
