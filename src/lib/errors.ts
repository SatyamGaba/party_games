import { ZodError } from "zod";
export class UserError extends Error {}
export function publicError(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (error instanceof ZodError)
    return error.issues[0]?.message ?? "Invalid request.";
  console.error(
    JSON.stringify({
      event: "unexpected_error",
      name: error instanceof Error ? error.name : "Unknown",
    }),
  );
  return "Something went wrong. Please try again.";
}
export function clientError(error: unknown): string {
  if (error instanceof ZodError)
    return error.issues[0]?.message ?? "Invalid request.";
  return error instanceof Error
    ? error.message
    : "Could not complete that request.";
}
