/**
 * The paint engine's own transcendental functions.
 *
 * Every function here uses only addition, subtraction, multiplication, division, Math.sqrt,
 * and exact helpers such as Math.floor, Math.round, and Math.abs. IEEE 754 rounds each of
 * those exactly, so the result is the same bit pattern on every machine and every build of V8.
 * The built-in Math.sin and friends can differ in the last bit between builds, which would
 * break exact golden image comparison. A lint rule bans them under src/core/paint/.
 *
 * Accuracy is a few units in the last place over the ranges a paint tool uses, which is far
 * more than an 8-bit pixel needs. math.test.ts states the tolerance for each function.
 */

export const PI = Math.PI;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

// pi/2 split into a high part with trailing zero bits and a low correction, so that
// k * PIO2_HI is exact for the k a paint tool produces and range reduction keeps precision.
const PIO2_HI = 1.5707963267341256;
const PIO2_LO = 6.077100506506192e-11;
const TWO_OVER_PI = 0.6366197723675814;

const LN2 = Math.LN2;
const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = Math.LOG2E;
const SQRT2 = Math.SQRT2;
const SQRT3 = 1.7320508075688772;
const PI_OVER_6 = 0.5235987755982988;
const TAN_PI_OVER_12 = 0.2679491924311227;

/** Taylor series of sin on [-pi/4, pi/4]. The first omitted term is below 5e-17. */
function sinKernel(x: number): number {
  const z = x * x;
  return (
    x +
    x *
      z *
      (-1 / 6 +
        z *
          (1 / 120 +
            z * (-1 / 5040 + z * (1 / 362880 + z * (-1 / 39916800 + z * (1 / 6227020800 + z * (-1 / 1307674368000)))))))
  );
}

/** Taylor series of cos on [-pi/4, pi/4]. The first omitted term is below 3e-18. */
function cosKernel(x: number): number {
  const z = x * x;
  return (
    1 +
    z *
      (-1 / 2 +
        z *
          (1 / 24 +
            z *
              (-1 / 720 +
                z *
                  (1 / 40320 +
                    z * (-1 / 3628800 + z * (1 / 479001600 + z * (-1 / 87178291200 + z * (1 / 20922789888000))))))))
  );
}

/** Reduces x to r in [-pi/4, pi/4] and the quadrant q in 0..3, with x = r + q * pi/2 (mod 2 pi). */
function reduce(x: number): { r: number; q: number } {
  const k = Math.round(x * TWO_OVER_PI);
  const r = x - k * PIO2_HI - k * PIO2_LO;
  return { r, q: ((k % 4) + 4) % 4 };
}

// sin and cos of infinity or NaN come out NaN without a guard: the reduction gives NaN.
export function sin(x: number): number {
  const { r, q } = reduce(x);
  switch (q) {
    case 0:
      return sinKernel(r);
    case 1:
      return cosKernel(r);
    case 2:
      return -sinKernel(r);
    default:
      return -cosKernel(r);
  }
}

export function cos(x: number): number {
  const { r, q } = reduce(x);
  switch (q) {
    case 0:
      return cosKernel(r);
    case 1:
      return -sinKernel(r);
    case 2:
      return -cosKernel(r);
    default:
      return sinKernel(r);
  }
}

/** Series for atan on |t| <= tan(pi/12). The first omitted term is below 2e-17. */
function atanKernel(t: number): number {
  // Keep the sign of zero, which the sum below would lose.
  if (t === 0) return t;
  const z = t * t;
  let sum = 0;
  // t^29 / 29 is the last term kept. Summing smallest first keeps the rounding error low.
  for (let n = 14; n >= 1; n--) sum = z * ((n % 2 === 0 ? 1 : -1) / (2 * n + 1) + sum);
  return t + t * sum;
}

/** NaN falls through every branch to the series, which returns NaN. Infinity reaches atan(0). */
export function atan(x: number): number {
  if (x < 0) return -atan(-x);
  if (x > 1) return HALF_PI - atan(1 / x);
  if (x > TAN_PI_OVER_12) return PI_OVER_6 + atanKernel((x * SQRT3 - 1) / (x + SQRT3));
  return atanKernel(x);
}

/** The angle of the point (x, y) from the positive x axis, in (-pi, pi]. */
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
  if (x > 0) return atan(y / x);
  if (x < 0) return y < 0 ? atan(y / x) - PI : atan(y / x) + PI;
  if (y === 0) return 0;
  return y > 0 ? HALF_PI : -HALF_PI;
}

// A little-endian view for building and splitting doubles bit by bit. Both directions are exact.
const bits = new DataView(new ArrayBuffer(8));

/** 2 to the power k for an integer k in [-1022, 1023], built from its bits. */
function powerOfTwo(k: number): number {
  bits.setUint32(0, 0, true);
  bits.setUint32(4, (k + 1023) << 20, true);
  return bits.getFloat64(0, true);
}

/** x times 2 to the power k, exact while the result is a normal double. */
export function scaleByPowerOfTwo(x: number, k: number): number {
  let result = x;
  let remaining = k;
  while (remaining > 1023) {
    result *= powerOfTwo(1023);
    remaining -= 1023;
  }
  while (remaining < -1022) {
    result *= powerOfTwo(-1022);
    remaining += 1022;
  }
  return result * powerOfTwo(remaining);
}

export function exp(x: number): number {
  // Past these limits the result overflows or underflows anyway. Returning early also handles
  // infinity and keeps scaleByPowerOfTwo from looping on huge exponents. NaN falls through to NaN.
  if (x > 709.782712893384) return Number.POSITIVE_INFINITY;
  if (x < -745.1332191019411) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  // Taylor series on |r| <= ln(2) / 2. The first omitted term, r^15 / 15!, is below 2e-19.
  let sum = 1;
  for (let n = 14; n >= 1; n--) sum = 1 + (r * sum) / n;
  return scaleByPowerOfTwo(sum, k);
}

export function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return Number.NEGATIVE_INFINITY;
  if (x === Number.POSITIVE_INFINITY) return x;
  let value = x;
  let exponent = 0;
  // Subnormal numbers have no implicit leading bit. Scale them into the normal range first.
  if (value < 2.2250738585072014e-308) {
    value *= 18014398509481984; // 2^54
    exponent -= 54;
  }
  bits.setFloat64(0, value, true);
  const high = bits.getUint32(4, true);
  exponent += ((high >>> 20) & 0x7ff) - 1023;
  // Keep the mantissa bits and set the exponent to zero, which gives m in [1, 2).
  bits.setUint32(4, (high & 0x000fffff) | 0x3ff00000, true);
  let m = bits.getFloat64(0, true);
  if (m > SQRT2) {
    m /= 2;
    exponent += 1;
  }
  // log(m) = 2 atanh(s) with s = (m - 1) / (m + 1), |s| <= 0.1716. The first omitted term,
  // 2 s^23 / 23, is below 3e-19.
  const s = (m - 1) / (m + 1);
  const z = s * s;
  let sum = 0;
  for (let n = 10; n >= 1; n--) sum = z * (1 / (2 * n + 1) + sum);
  return exponent * LN2 + 2 * (s + s * sum);
}

/**
 * x raised to y. Integer powers multiply by squaring, in at most 53 rounds. Other powers use
 * exp and log, which also give NaN for a negative base and the right limit for a zero base.
 */
export function pow(x: number, y: number): number {
  if (Number.isInteger(y)) {
    let base = y < 0 ? 1 / x : x;
    let n = Math.abs(y);
    let result = 1;
    while (n > 0) {
      if (n % 2 === 1) result *= base;
      base *= base;
      n = Math.floor(n / 2);
    }
    return result;
  }
  return exp(y * log(x));
}

export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Hermite smoothstep from 0 at edge0 to 1 at edge1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function degreesToRadians(degrees: number): number {
  return (degrees / 180) * PI;
}
