import { z } from "zod";
import { LIMITS } from "../lib/config";
export const roleSchema = z.enum(["player", "display"]);
export const joinSchema = z
  .object({
    role: roleSchema.default("player"),
    name: z.string().trim().max(LIMITS.nameLength).default(""),
    /** Device secret that lets a returning person reclaim their seat. Never synced. */
    playerKey: z.string().min(16).max(64).optional(),
  })
  .refine((v) => v.role === "display" || v.name.length > 0, "Enter your name.");
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{4}$/, "Enter a valid four-character room code.");
export const submissionSchema = z.object({
  submissionId: z.string().min(1).max(80),
  scope: z.string().min(1).max(80),
  answer: z.unknown(),
});
