/** Display estimates only; transaction bounds still come from farm-slippage. */
export function marginDebt(riskDebt: number, loanDebt: number, risk: number, loan: number, price: number) {
  return Math.max(0, riskDebt - risk) * price + Math.max(0, loanDebt - loan);
}

// Human-unit risk/quote coordinates also cover reversed pool token ordering.
export function lpAmounts(lower: number, upper: number, price: number) {
  const a = Math.sqrt(lower),
    b = Math.sqrt(upper);
  const p = Math.sqrt(Math.max(lower, Math.min(upper, price)));
  return { risk: 1 / p - 1 / b, loan: p - a };
}

export function increaseEstimate(
  margin: number,
  leverage: number,
  oraclePrice: number,
  poolPrice: number,
  lower: number,
  upper: number,
  debtRisk: number,
  debtLoan: number,
) {
  const perLeg = (margin * leverage) / 2;
  const borrowedRisk = perLeg / oraclePrice;
  const borrowedLoan = Math.max(0, perLeg - margin);
  const unit = lpAmounts(lower, upper, poolPrice);
  if (unit.risk <= 0 || unit.loan <= 0) return undefined;
  const liquidity = Math.min(borrowedRisk / unit.risk, (margin + borrowedLoan) / unit.loan);
  const fair = lpAmounts(lower, upper, oraclePrice);
  // _repayOpenDust repays the existing debt too, before refunding any remainder.
  return {
    value: liquidity * (fair.risk * oraclePrice + fair.loan),
    debt: marginDebt(
      debtRisk + borrowedRisk,
      debtLoan + borrowedLoan,
      borrowedRisk - liquidity * unit.risk,
      margin + borrowedLoan - liquidity * unit.loan,
      oraclePrice,
    ),
  };
}

/** Scenario estimate: quote price fixed, LP follows risk price; fees/interest excluded.
 * Calibrate to the on-chain position value at the current oracle price.
 * A concentrated dual-debt LP can liquidate on either side of its range.
 */
export function liquidationPrices(
  value: number,
  debtRisk: number,
  debtLoan: number,
  price: number,
  lower: number,
  upper: number,
  lltv: number,
): number[] | undefined {
  if (![value, price, lower, upper, lltv].every((n) => Number.isFinite(n) && n > 0) || lower >= upper) return undefined;
  const current = lpAmounts(lower, upper, price);
  const liquidity = value / (current.risk * price + current.loan);
  const buffer = (p: number) => {
    const amounts = lpAmounts(lower, upper, p);
    return liquidity * (amounts.risk * p + amounts.loan) * lltv - debtRisk * p - debtLoan;
  };
  if (buffer(price) <= 0) return undefined;
  const roots: number[] = [];
  for (const direction of [-1, 1]) {
    let safe = price;
    for (let i = 1; i <= 80; i++) {
      let unsafe = price * 2 ** (direction * i);
      if (buffer(unsafe) <= 0) {
        for (let j = 0; j < 80; j++) {
          const mid = (safe + unsafe) / 2;
          if (buffer(mid) > 0) safe = mid;
          else unsafe = mid;
        }
        roots.push((safe + unsafe) / 2);
        break;
      }
      safe = unsafe;
    }
  }
  return roots;
}
