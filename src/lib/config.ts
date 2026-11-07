export const LIMITS = {
  players: 24,
  clients: 40,
  /** How long a disconnected participant keeps their place before being dropped. */
  reconnectSeconds: 300,
  nameLength: 24,
  messageBytes: 16_384,
  messagesPerSecond: 10,
} as const;
