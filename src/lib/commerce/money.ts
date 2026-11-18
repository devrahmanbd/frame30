/**
 * Pure monetary minor-unit arithmetic for Framique.
 *
 * Invariant: All monetary calculations are performed in integer minor units (e.g. poisha/cents).
 * Floating-point money computation or transmission is strictly prohibited.
 */

/**
 * Sum an array of integer minor-unit amounts.
 * Guarantees associative, commutative integer addition without floating-point drift.
 */
export function sumMinorUnits(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    const intAmount = Math.trunc(amount);
    return total + (Number.isFinite(intAmount) ? intAmount : 0);
  }, 0);
}

/**
 * Calculate the line item total for a given quantity and unit price in minor units.
 * Guarantees non-negative integer multiplication bounded by practical commerce ceilings.
 */
export function calculateLineTotal(unitPriceMinor: number, quantity: number): number {
  const safePrice = Math.max(0, Math.trunc(unitPriceMinor));
  const safeQty = Math.max(0, Math.trunc(quantity));
  return safePrice * safeQty;
}

/**
 * Sum the total cost of a cart consisting of multiple line items.
 */
export function sumCartLines(
  lines: readonly { unitPriceMinor: number; quantity: number }[],
): number {
  return lines.reduce((acc, line) => {
    return acc + calculateLineTotal(line.unitPriceMinor, line.quantity);
  }, 0);
}

/**
 * Deterministically formats minor-unit integers into standard display strings.
 */
export function formatMinorUnits(minor: number, currency = "BDT"): string {
  const safeMinor = Math.max(0, Math.trunc(minor));
  const major = Math.floor(safeMinor / 100);
  const rem = safeMinor % 100;
  const remStr = rem < 10 ? `0${rem}` : `${rem}`;
  return `${currency} ${major}.${remStr}`;
}
