import { describe, expect, it } from "vitest";
import { solveLinearProgram, type LpConstraint } from "./simplex";

function constraint(
  coefficients: Record<number, number>,
  relation: LpConstraint["relation"],
  rhs: number,
): LpConstraint {
  return {
    coefficients: new Map(Object.entries(coefficients).map(([k, v]) => [Number(k), v])),
    relation,
    rhs,
  };
}

describe("solveLinearProgram", () => {
  it("solves a basic maximization written as minimization", () => {
    // maximize 3x + 5y <=> minimize -3x - 5y
    // x <= 4, 2y <= 12, 3x + 2y <= 18 -> optimum x=2, y=6, value 36
    const solution = solveLinearProgram({
      variableCount: 2,
      objective: new Map([
        [0, -3],
        [1, -5],
      ]),
      constraints: [
        constraint({ 0: 1 }, "<=", 4),
        constraint({ 1: 2 }, "<=", 12),
        constraint({ 0: 3, 1: 2 }, "<=", 18),
      ],
    });

    expect(solution.status).toBe("optimal");
    expect(solution.values[0]).toBeCloseTo(2, 6);
    expect(solution.values[1]).toBeCloseTo(6, 6);
    expect(solution.objective).toBeCloseTo(-36, 6);
  });

  it("handles equality and >= constraints via two phases", () => {
    // minimize 2x + 3y with x + y = 10, x >= 4 -> x=10, y=0? No: cost of x is
    // lower than y, so push everything into x: x=10, y=0, objective 20.
    const solution = solveLinearProgram({
      variableCount: 2,
      objective: new Map([
        [0, 2],
        [1, 3],
      ]),
      constraints: [constraint({ 0: 1, 1: 1 }, "=", 10), constraint({ 0: 1 }, ">=", 4)],
    });

    expect(solution.status).toBe("optimal");
    expect(solution.values[0]).toBeCloseTo(10, 6);
    expect(solution.values[1]).toBeCloseTo(0, 6);
    expect(solution.objective).toBeCloseTo(20, 6);
  });

  it("reports infeasible systems", () => {
    const solution = solveLinearProgram({
      variableCount: 1,
      objective: new Map([[0, 1]]),
      constraints: [constraint({ 0: 1 }, "<=", 1), constraint({ 0: 1 }, ">=", 2)],
    });

    expect(solution.status).toBe("infeasible");
  });

  it("reports unbounded problems", () => {
    const solution = solveLinearProgram({
      variableCount: 1,
      objective: new Map([[0, -1]]),
      constraints: [constraint({ 0: 1 }, ">=", 0)],
    });

    expect(solution.status).toBe("unbounded");
  });

  it("normalizes negative right-hand sides", () => {
    // -x <= -5  <=>  x >= 5
    const solution = solveLinearProgram({
      variableCount: 1,
      objective: new Map([[0, 1]]),
      constraints: [constraint({ 0: -1 }, "<=", -5)],
    });

    expect(solution.status).toBe("optimal");
    expect(solution.values[0]).toBeCloseTo(5, 6);
  });

  it("solves a cyclic balance system like a recycling loop", () => {
    // Two recipes: A consumes 100 acid, emits 1 product + 90 spent.
    // B consumes 90 spent, emits 95 acid. External acid tops up the loop.
    // Variables: a (runs of A), b (runs of B), ext (external acid rate).
    // acid: 95b + ext - 100a = 0; spent: 90a - 90b = 0; product: a >= 2.
    const solution = solveLinearProgram({
      variableCount: 3,
      objective: new Map([[2, 1]]),
      constraints: [
        constraint({ 1: 95, 2: 1, 0: -100 }, "=", 0),
        constraint({ 0: 90, 1: -90 }, "=", 0),
        constraint({ 0: 1 }, ">=", 2),
      ],
    });

    expect(solution.status).toBe("optimal");
    expect(solution.values[0]).toBeCloseTo(2, 6);
    expect(solution.values[1]).toBeCloseTo(2, 6);
    expect(solution.values[2]).toBeCloseTo(10, 6); // 200 - 190 topped up externally
  });

  it("handles degenerate ties without cycling", () => {
    const solution = solveLinearProgram({
      variableCount: 2,
      objective: new Map([
        [0, -1],
        [1, -1],
      ]),
      constraints: [
        constraint({ 0: 1, 1: 1 }, "<=", 1),
        constraint({ 0: 1 }, "<=", 1),
        constraint({ 1: 1 }, "<=", 1),
        constraint({ 0: 1, 1: -1 }, "<=", 0),
      ],
    });

    expect(solution.status).toBe("optimal");
    expect(solution.objective).toBeCloseTo(-1, 6);
  });
});
