import { UserError } from "../../lib/errors";
/** Per-scope, per-player idempotency. Games still own answer and deadline rules. */
export class SubmissionLedger {
  private entries = new Map<string, { id: string; answer: string }>();
  check(actor: string, id: string, answer: unknown): boolean {
    const existing = this.entries.get(actor);
    if (!existing) return false;
    if (existing.id === id && existing.answer === JSON.stringify(answer))
      return true;
    throw new UserError("Your answer is already locked.");
  }
  accept(actor: string, id: string, answer: unknown) {
    this.entries.set(actor, { id, answer: JSON.stringify(answer) });
  }
  clear() {
    this.entries.clear();
  }
}
