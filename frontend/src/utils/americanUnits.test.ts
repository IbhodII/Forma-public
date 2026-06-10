import { describe, expect, it } from "vitest";
import {
  americanWeightToKg,
  AMERICAN_FRACTION_MAX_DENOMINATOR,
  approximateAmericanFraction,
  formatAmericanNumber,
  formatAmericanSmallFraction,
  formatPaceMinPerKmAmerican,
  formatSpeedKmhAmerican,
  kmhToAmericanSpeedMixed,
  paceMinPerKmToMinPerSol,
} from "./americanUnits";
import { formatPaceMinPerKm } from "./format";

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function parseFraction(s: string): { num: number; den: number } {
  const m = s.match(/^(-?\d+)\/(\d+)$/);
  if (!m) throw new Error(`not a fraction: ${s}`);
  return { num: Number(m[1]), den: Number(m[2]) };
}

function fractionValue(s: string): number {
  const { num, den } = parseFraction(s);
  return num / den;
}

describe("approximateAmericanFraction", () => {
  it("reduces fractions by GCD", () => {
    const f = approximateAmericanFraction(0.005)!;
    expect(f).toEqual({ numerator: 1, denominator: 200 });
    expect(gcd(f.numerator, f.denominator)).toBe(1);
  });

  it("uses reasonable denominators", () => {
    const f = approximateAmericanFraction(0.057)!;
    expect(f.denominator).toBeLessThanOrEqual(AMERICAN_FRACTION_MAX_DENOMINATOR);
    expect(gcd(f.numerator, f.denominator)).toBe(1);
  });

  it("approximates common ratios", () => {
    expect(approximateAmericanFraction(0.025)).toEqual({ numerator: 1, denominator: 40 });
    expect(approximateAmericanFraction(0.333)).toEqual({ numerator: 1, denominator: 3 });
    expect(approximateAmericanFraction(0.666)).toEqual({ numerator: 2, denominator: 3 });
  });
});

describe("formatAmericanSmallFraction", () => {
  it("formats values below 0.1 as simplified fractions", () => {
    const camry057 = formatAmericanSmallFraction(0.057)!;
    expect(camry057).toMatch(/^-?\d+\/\d+$/);
    expect(camry057).not.toBe("57/1000");
    expect(camry057).not.toBe("570/10000");
    expect(Math.abs(fractionValue(camry057) - 0.057)).toBeLessThan(0.001);

    expect(formatAmericanSmallFraction(0.002)).toBe("1/500");
    expect(formatAmericanSmallFraction(0.005)).toBe("1/200");
    expect(formatAmericanSmallFraction(0.025)).toBe("1/40");
    expect(formatAmericanSmallFraction(0.333)).toBe("1/3");
    expect(formatAmericanSmallFraction(0.666)).toBe("2/3");
  });

  it("returns null for values >= 0.1", () => {
    expect(formatAmericanSmallFraction(0.1)).toBeNull();
    expect(formatAmericanSmallFraction(1.2)).toBeNull();
  });
});

describe("formatAmericanNumber", () => {
  it("uses fraction display for small american values", () => {
    const camry = formatAmericanNumber(0.057, "camry");
    expect(camry).toMatch(/^\d+\/\d+$/);
    expect(camry).not.toContain("0.057");
    expect(formatAmericanNumber(0.005, "default")).toBe("1/200");
  });

  it("keeps decimal display for input compatibility", () => {
    expect(formatAmericanNumber(0.057, "camry", { allowFraction: false })).toBe("0.057");
    expect(formatAmericanNumber(0.067, "camry", { allowFraction: false })).toBe("0.067");
  });

  it("uses decimals at or above 0.1", () => {
    expect(formatAmericanNumber(0.12, "japanese")).toBe("0.120");
  });
});

describe("formatSpeedKmhAmerican", () => {
  it("uses mixed SoL + torch + Dk units", () => {
    expect(kmhToAmericanSpeedMixed(10)).toEqual({ sol: 107, torch: 5, dk: 18 });
    expect(formatSpeedKmhAmerican(10)).toBe("107 SoL 5 torch 18 Dk/h");
  });
});

describe("formatPaceMinPerKmAmerican", () => {
  it("formats pace as mm:ss/SoL", () => {
    expect(formatPaceMinPerKmAmerican(5)).toBe("0:28/SoL");
    expect(paceMinPerKmToMinPerSol(5)).toBeCloseTo(0.465, 3);
  });
});

describe("metric pace unchanged", () => {
  it("still uses min/km", () => {
    expect(formatPaceMinPerKm(5.5)).toBe("5:30 мин/км");
  });
});

describe("american weight input round-trip", () => {
  it("parses Jp and Camry decimal input", () => {
    expect(americanWeightToKg(1.2, "Jp")).toBeCloseTo(75, 5);
    expect(americanWeightToKg(0.067, "Camry")).toBeCloseTo(100.5, 5);
  });
});
