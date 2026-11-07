import { describe, it, expect } from "vitest";
import { codeSchema, joinSchema } from "../src/platform/validation";
import { SubmissionLedger } from "../src/platform/server/submissions";
import { cn } from "../src/lib/cn";
describe("shared helpers", () => {
  it("validates names, roles and room codes", () => {
    expect(joinSchema.parse({ name: "  Sam  " }).name).toBe("Sam");
    expect(joinSchema.safeParse({ name: " " }).success).toBe(false);
    expect(
      joinSchema.safeParse({ name: "Sam", role: "moderator" }).success,
    ).toBe(false);
    expect(joinSchema.parse({ role: "display" }).role).toBe("display");
    expect(codeSchema.parse(" abcde ")).toBe("ABCDE");
    expect(codeSchema.safeParse("ABCDE123").success).toBe(false);
  });
  it("acknowledges exact retries but rejects changes or a second identity", () => {
    const ledger = new SubmissionLedger();
    expect(ledger.check("sam", "a", 5)).toBe(false);
    ledger.accept("sam", "a", 5);
    expect(ledger.check("sam", "a", 5)).toBe(true);
    expect(() => ledger.check("sam", "a", 6)).toThrow("locked");
    expect(() => ledger.check("sam", "b", 5)).toThrow("locked");
    ledger.clear();
    expect(ledger.check("sam", "b", 6)).toBe(false);
  });
  it("keeps semantic font sizes alongside text colors", () => {
    expect(cn("text-body", "text-foreground")).toBe(
      "text-body text-foreground",
    );
    expect(cn("p-2", false, "p-4")).toBe("p-4");
  });
});
