import express, { type RequestHandler } from "express";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { Server, Room } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { LIMITS } from "../../lib/config";
export function createPartyServer(
  games: Record<string, new () => Room>,
  middleware: RequestHandler[] = [],
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  const limiter = new RateLimiterMemory({ points: 120, duration: 60 });
  app.use("/matchmake", (req, res, next) => {
    limiter
      .consume(req.socket.remoteAddress ?? "unknown")
      .then(() => next())
      .catch(() =>
        res
          .status(429)
          .json({ error: "Too many requests. Try again shortly." }),
      );
  });
  for (const handler of middleware) app.use(handler);
  app.get("/health", (_req, res) => res.json({ ok: true }));
  const http = createServer(app);
  const transport = new WebSocketTransport({
    server: http,
    maxPayload: LIMITS.messageBytes,
  });
  const server = new Server({
    transport,
    greet: false,
    gracefullyShutdown: false,
  });
  for (const [id, room] of Object.entries(games)) server.define(id, room);
  // Colyseus attaches matchmaking before the SPA fallback.
  app.use(express.static(resolve("dist/client")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("dist/client/index.html")),
  );
  return { server, http, app };
}
