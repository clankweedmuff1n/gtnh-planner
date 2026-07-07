const TOLERANCE = 1e-9;
/**
 * Rough floating-point operation budget per simplex phase. A pivot plus
 * pricing costs about 2 * rows * columns, so the pivot cap scales down as the
 * tableau grows — a huge or degenerate problem fails fast with
 * "iteration-limit" instead of freezing the UI thread for minutes.
 */
const OPS_BUDGET = 200_000_000;
const MIN_PIVOTS = 200;
const MAX_PIVOTS = 20000;

export type LpRelation = "<=" | ">=" | "=";

export interface LpConstraint {
  /** Sparse row: variable index -> coefficient. */
  coefficients: Map<number, number>;
  relation: LpRelation;
  rhs: number;
}

export interface LpProblem {
  variableCount: number;
  /** Sparse minimization objective: variable index -> cost. */
  objective: Map<number, number>;
  constraints: LpConstraint[];
}

export type LpStatus = "optimal" | "infeasible" | "unbounded" | "iteration-limit";

export interface LpSolution {
  status: LpStatus;
  /** Values for the original variables (length = variableCount). */
  values: number[];
  objective: number;
}

type Tableau = {
  matrix: number[][];
  rhs: number[];
  basis: number[];
  basisSet: Set<number>;
  columnCount: number;
};

/**
 * Solves `minimize c·x subject to A·x {<=,=,>=} b, x >= 0` with a dense
 * two-phase simplex using Bland's rule (guaranteed termination, no cycling).
 * Problem sizes in this app are tiny (tens of variables), so density is fine.
 */
export function solveLinearProgram(problem: LpProblem): LpSolution {
  const rowCount = problem.constraints.length;
  const structuralCount = problem.variableCount;

  // Count auxiliary columns: slack for <=, surplus for >=, artificial for >= and =.
  let slackCount = 0;
  let artificialCount = 0;
  for (const constraint of problem.constraints) {
    const relation = normalizedRelation(constraint);
    if (relation === "<=") {
      slackCount += 1;
    } else if (relation === ">=") {
      slackCount += 1;
      artificialCount += 1;
    } else {
      artificialCount += 1;
    }
  }

  const columnCount = structuralCount + slackCount + artificialCount;
  const matrix: number[][] = [];
  const rhs: number[] = [];
  const basis: number[] = new Array(rowCount).fill(-1);
  const artificialColumns: number[] = [];

  let nextSlack = structuralCount;
  let nextArtificial = structuralCount + slackCount;

  for (let row = 0; row < rowCount; row += 1) {
    const constraint = problem.constraints[row];
    const flip = constraint.rhs < 0 ? -1 : 1;
    const relation = normalizedRelation(constraint);
    const line = new Array<number>(columnCount).fill(0);
    for (const [column, coefficient] of constraint.coefficients) {
      if (column < 0 || column >= structuralCount) {
        throw new Error(`LP constraint references unknown variable ${column}`);
      }
      line[column] += flip * coefficient;
    }
    rhs.push(flip * constraint.rhs);

    if (relation === "<=") {
      line[nextSlack] = 1;
      basis[row] = nextSlack;
      nextSlack += 1;
    } else if (relation === ">=") {
      line[nextSlack] = -1;
      nextSlack += 1;
      line[nextArtificial] = 1;
      basis[row] = nextArtificial;
      artificialColumns.push(nextArtificial);
      nextArtificial += 1;
    } else {
      line[nextArtificial] = 1;
      basis[row] = nextArtificial;
      artificialColumns.push(nextArtificial);
      nextArtificial += 1;
    }
    matrix.push(line);
  }

  const tableau: Tableau = { matrix, rhs, basis, basisSet: new Set(basis), columnCount };

  if (artificialColumns.length > 0) {
    const phaseOneCost = new Array<number>(columnCount).fill(0);
    for (const column of artificialColumns) {
      phaseOneCost[column] = 1;
    }
    const phaseOne = runSimplex(tableau, phaseOneCost, undefined);
    if (phaseOne.status === "iteration-limit") {
      return { status: "iteration-limit", values: [], objective: NaN };
    }
    if (phaseOne.status === "unbounded") {
      // Phase-1 objective is bounded below by zero; this cannot happen.
      return { status: "infeasible", values: [], objective: NaN };
    }
    if (phaseOne.objective > 1e-6) {
      return { status: "infeasible", values: [], objective: NaN };
    }
    driveArtificialsOutOfBasis(tableau, new Set(artificialColumns));
  }

  const cost = new Array<number>(columnCount).fill(0);
  for (const [column, coefficient] of problem.objective) {
    if (column < 0 || column >= structuralCount) {
      throw new Error(`LP objective references unknown variable ${column}`);
    }
    cost[column] += coefficient;
  }
  const phaseTwo = runSimplex(tableau, cost, new Set(artificialColumns));
  if (phaseTwo.status !== "optimal") {
    return { status: phaseTwo.status, values: [], objective: NaN };
  }

  const values = new Array<number>(structuralCount).fill(0);
  for (let row = 0; row < rowCount; row += 1) {
    const column = tableau.basis[row];
    if (column >= 0 && column < structuralCount) {
      values[column] = tableau.rhs[row];
    }
  }

  let objective = 0;
  for (const [column, coefficient] of problem.objective) {
    objective += coefficient * values[column];
  }

  return { status: "optimal", values, objective };
}

function normalizedRelation(constraint: LpConstraint): LpRelation {
  if (constraint.rhs >= 0 || constraint.relation === "=") {
    return constraint.relation;
  }
  return constraint.relation === "<=" ? ">=" : "<=";
}

function runSimplex(
  tableau: Tableau,
  cost: number[],
  blockedColumns: Set<number> | undefined,
): { status: "optimal" | "unbounded" | "iteration-limit"; objective: number } {
  const { matrix, rhs, basis, basisSet, columnCount } = tableau;
  const rowCount = matrix.length;
  const pivotCap = Math.min(
    MAX_PIVOTS,
    Math.max(MIN_PIVOTS, Math.floor(OPS_BUDGET / (2 * Math.max(1, rowCount) * columnCount))),
  );

  // Reduced costs kept implicitly: recompute the dual row each iteration.
  // O(rows * columns) per iteration is acceptable at this scale.
  for (let pivots = 0; ; pivots += 1) {
    if (pivots >= pivotCap) {
      return { status: "iteration-limit", objective: NaN };
    }
    const duals = new Array<number>(rowCount);
    for (let row = 0; row < rowCount; row += 1) {
      duals[row] = cost[basis[row]];
    }

    // Bland's rule: pick the lowest-index column with negative reduced cost.
    let entering = -1;
    for (let column = 0; column < columnCount; column += 1) {
      if (blockedColumns?.has(column) || basisSet.has(column)) {
        continue;
      }
      let reduced = cost[column];
      for (let row = 0; row < rowCount; row += 1) {
        const coefficient = matrix[row][column];
        if (coefficient !== 0) {
          reduced -= duals[row] * coefficient;
        }
      }
      if (reduced < -TOLERANCE) {
        entering = column;
        break;
      }
    }

    if (entering === -1) {
      let objective = 0;
      for (let row = 0; row < rowCount; row += 1) {
        objective += cost[basis[row]] * rhs[row];
      }
      return { status: "optimal", objective };
    }

    // Ratio test with Bland's tie-break (lowest basis index).
    let leavingRow = -1;
    let bestRatio = Number.POSITIVE_INFINITY;
    for (let row = 0; row < rowCount; row += 1) {
      const coefficient = matrix[row][entering];
      if (coefficient <= TOLERANCE) {
        continue;
      }
      const ratio = rhs[row] / coefficient;
      if (
        ratio < bestRatio - TOLERANCE ||
        (ratio < bestRatio + TOLERANCE && leavingRow >= 0 && basis[row] < basis[leavingRow])
      ) {
        bestRatio = ratio;
        leavingRow = row;
      }
    }

    if (leavingRow === -1) {
      return { status: "unbounded", objective: NaN };
    }

    pivot(tableau, leavingRow, entering);
  }
}

function driveArtificialsOutOfBasis(tableau: Tableau, artificialColumns: Set<number>) {
  const { matrix, rhs, basis, columnCount } = tableau;
  for (let row = 0; row < matrix.length; row += 1) {
    if (!artificialColumns.has(basis[row])) {
      continue;
    }

    let pivotColumn = -1;
    for (let column = 0; column < columnCount; column += 1) {
      if (artificialColumns.has(column) || tableau.basisSet.has(column)) {
        continue;
      }
      if (Math.abs(matrix[row][column]) > TOLERANCE) {
        pivotColumn = column;
        break;
      }
    }

    if (pivotColumn >= 0) {
      pivot(tableau, row, pivotColumn);
    } else if (Math.abs(rhs[row]) <= 1e-6) {
      // Redundant row: the artificial stays basic at zero, which is harmless
      // as long as phase 2 blocks artificial columns from re-entering.
      continue;
    }
  }
}

function pivot(tableau: Tableau, pivotRow: number, pivotColumn: number) {
  const { matrix, rhs, basis } = tableau;
  const pivotValue = matrix[pivotRow][pivotColumn];
  const row = matrix[pivotRow];
  for (let column = 0; column < row.length; column += 1) {
    row[column] /= pivotValue;
  }
  rhs[pivotRow] /= pivotValue;

  for (let other = 0; other < matrix.length; other += 1) {
    if (other === pivotRow) {
      continue;
    }
    const factor = matrix[other][pivotColumn];
    if (factor === 0) {
      continue;
    }
    const otherRow = matrix[other];
    for (let column = 0; column < otherRow.length; column += 1) {
      otherRow[column] -= factor * row[column];
    }
    rhs[other] -= factor * rhs[pivotRow];
  }

  tableau.basisSet.delete(basis[pivotRow]);
  tableau.basisSet.add(pivotColumn);
  basis[pivotRow] = pivotColumn;
}
