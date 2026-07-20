import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimit, rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimit());

  it("autorise jusqu'à la limite puis bloque", () => {
    expect(rateLimit("u1", 2, 1000, 0).allowed).toBe(true); // 1
    expect(rateLimit("u1", 2, 1000, 100).allowed).toBe(true); // 2
    const bloque = rateLimit("u1", 2, 1000, 200);
    expect(bloque.allowed).toBe(false);
    expect(bloque.remaining).toBe(0);
  });

  it("réinitialise après la fenêtre", () => {
    rateLimit("u2", 1, 1000, 0);
    expect(rateLimit("u2", 1, 1000, 500).allowed).toBe(false);
    expect(rateLimit("u2", 1, 1000, 1000).allowed).toBe(true); // fenêtre écoulée
  });

  it("isole les clés (utilisateurs) entre elles", () => {
    rateLimit("a", 1, 1000, 0);
    expect(rateLimit("a", 1, 1000, 0).allowed).toBe(false);
    expect(rateLimit("b", 1, 1000, 0).allowed).toBe(true);
  });
});
