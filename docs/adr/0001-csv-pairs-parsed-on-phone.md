---
status: deprecated
---

# Custom word pairs are parsed on the host's phone and sent in batches over the room socket

Undercover lets the host upload a CSV of Custom pairs. We parse the file in the browser with Papa Parse and send the pairs to the room in batches of ~100 over the existing Colyseus message channel; the server re-validates every pair with zod and caps the room at 1,000 pairs. We rejected a dedicated HTTP upload endpoint (needs multipart handling and a separate way to prove the request comes from the host's seat) and raising `LIMITS.messageBytes` (16 KB) for every game just to fit one file. Pairs live in room memory only and are never persisted.

**Deprecated (2026-11-07):** custom CSV uploads were dropped before release; Undercover uses only Built-in pairs. Kept for the record of why an upload endpoint was rejected, should custom words return.
