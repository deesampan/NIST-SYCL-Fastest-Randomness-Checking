/**
 * NIST SP 800-22 — JavaScript implementation
 * Runs Test (Section 2.3) and Longest Run of Ones (Section 2.4)
 *
 * Ported from the C++ reference implementation in this project.
 * All math matches the NIST SP 800-22 Rev 1a specification.
 */

// ============================================================
// Special math functions
// ============================================================

/**
 * erfc(x) — complementary error function
 * Abramowitz & Stegun approximation, max error ~1.5e-7
 */
function erfc(x) {
  const p  = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const result = poly * Math.exp(-absX * absX);
  return x >= 0 ? result : 2.0 - result;
}

/**
 * lgamma(x) — natural log of the gamma function
 * Lanczos approximation (Numerical Recipes)
 */
function lgamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }

  let xx = x - 1;
  let a = c[0];
  const t = xx + g + 0.5;
  for (let i = 1; i <= g + 1; i++) {
    a += c[i] / (xx + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * igamma_series(a, x) — regularized lower incomplete gamma P(a,x) via series
 */
function igamma_series(a, x) {
  const ITMAX = 300;
  const EPS   = 3e-9;

  let ap  = a;
  let del = 1.0 / a;
  let sum = del;

  for (let n = 0; n < ITMAX; n++) {
    ap  += 1.0;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }

  return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

/**
 * igamma_cf(a, x) — upper incomplete gamma Q(a,x) via continued fraction (Lentz)
 */
function igamma_cf(a, x) {
  const ITMAX = 300;
  const EPS   = 3e-9;
  const FPMIN = 1e-300;

  let b = x + 1.0 - a;
  let c = 1.0 / FPMIN;
  let d = 1.0 / b;
  let h = d;

  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2.0;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }

  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

/**
 * igamc(a, x) — upper incomplete gamma function Q(a,x) = 1 - P(a,x)
 * Used for chi-squared p-values: P = igamc(K/2, chi2/2)
 */
function igamc(a, x) {
  if (x <= 0 || a <= 0) return 1.0;
  if (x < a + 1.0) {
    return 1.0 - igamma_series(a, x);
  }
  return igamma_cf(a, x);
}

// ============================================================
// Input parsing
// ============================================================

/**
 * Parse a string of arbitrary text into a Uint8Array of 0/1 values.
 * Ignores everything that is not '0' or '1'.
 */
function parseBits(str) {
  const arr = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 48) arr.push(0);  // '0'
    else if (c === 49) arr.push(1);  // '1'
  }
  return new Uint8Array(arr);
}

// ============================================================
// NIST SP 800-22 Section 2.3 — Runs Test
// ============================================================

/**
 * Runs Test
 * @param {Uint8Array} bits
 * @returns {object} result
 */
function runsTest(bits) {
  const n = bits.length;

  if (n < 100) {
    return {
      name: 'Runs Test',
      error: `Sequence too short: ${n} bits (minimum 100 required)`,
    };
  }

  // π = proportion of ones
  let ones = 0;
  for (let i = 0; i < n; i++) ones += bits[i];
  const pi = ones / n;

  // Prerequisite: |π − 0.5| < 2/√n
  const tau = 2.0 / Math.sqrt(n);
  const prerequisite_failed = Math.abs(pi - 0.5) >= tau;

  if (prerequisite_failed) {
    return {
      name: 'Runs Test',
      n,
      ones,
      zeros: n - ones,
      pi,
      tau,
      prerequisite_failed: true,
      p_value: 0,
      passed: false,
      note: `|π − 0.5| = ${Math.abs(pi - 0.5).toFixed(6)} ≥ τ = ${tau.toFixed(6)} — test skipped`,
    };
  }

  // V_obs = number of runs (transitions + 1)
  let v_obs = 1;
  for (let i = 1; i < n; i++) {
    if (bits[i] !== bits[i - 1]) v_obs++;
  }

  // P-value = erfc(|V_obs − 2nπ(1−π)| / (2√(2n)·π·(1−π)))
  const expected_v = 2.0 * n * pi * (1.0 - pi);
  const numerator  = Math.abs(v_obs - expected_v);
  const denominator = 2.0 * Math.sqrt(2.0 * n) * pi * (1.0 - pi);
  const p_value     = erfc(numerator / denominator);

  return {
    name: 'Runs Test',
    section: '2.3',
    n,
    ones,
    zeros: n - ones,
    pi,
    tau,
    v_obs,
    expected_v,
    numerator,
    denominator,
    p_value,
    alpha: 0.01,
    passed: p_value >= 0.01,
    prerequisite_failed: false,
  };
}

// ============================================================
// NIST SP 800-22 Section 2.4 — Longest Run of Ones in a Block
// ============================================================

// NIST table parameters keyed by minimum sequence length
const LR_PARAMS = [
  {
    min_n: 750000,
    M: 10000, N: 75, K: 6, v_min: 10,
    pi: [0.0882, 0.2092, 0.2483, 0.1933, 0.1208, 0.0675, 0.0727],
  },
  {
    min_n: 6272,
    M: 128, N: 49, K: 5, v_min: 4,
    pi: [0.1174, 0.2430, 0.2493, 0.1752, 0.1027, 0.1124],
  },
  {
    min_n: 128,
    M: 8, N: 16, K: 3, v_min: 1,
    pi: [0.2148, 0.3672, 0.2305, 0.1875],
  },
];

/**
 * Longest Run of Ones in a Block Test
 * @param {Uint8Array} bits
 * @returns {object} result
 */
function longestRunTest(bits) {
  const n = bits.length;

  if (n < 128) {
    return {
      name: 'Longest Run of Ones Test',
      error: `Sequence too short: ${n} bits (minimum 128 required)`,
    };
  }

  // Select parameter set
  let params = null;
  for (const p of LR_PARAMS) {
    if (n >= p.min_n) { params = p; break; }
  }

  const { M, N, K, v_min, pi: pi_table } = params;

  // Compute longest run in each of the N blocks
  const v = new Array(K + 1).fill(0);
  const block_maxima = [];

  for (let block = 0; block < N; block++) {
    let max_run = 0;
    let cur_run = 0;
    const start = block * M;
    for (let i = 0; i < M; i++) {
      if (bits[start + i] === 1) {
        cur_run++;
        if (cur_run > max_run) max_run = cur_run;
      } else {
        cur_run = 0;
      }
    }
    block_maxima.push(max_run);

    // Classify into histogram
    let cat;
    if (max_run <= v_min) {
      cat = 0;
    } else if (max_run >= v_min + K) {
      cat = K;
    } else {
      cat = max_run - v_min;
    }
    v[cat]++;
  }

  // Chi-squared statistic
  let chi2 = 0;
  const expected = pi_table.map(p => N * p);
  for (let i = 0; i <= K; i++) {
    chi2 += Math.pow(v[i] - expected[i], 2) / expected[i];
  }

  // P-value = igamc(K/2, chi2/2)
  const p_value = igamc(K / 2.0, chi2 / 2.0);

  return {
    name: 'Longest Run of Ones Test',
    section: '2.4',
    n, M, N, K, v_min,
    pi_table, v, expected, chi2, p_value,
    alpha: 0.01,
    passed: p_value >= 0.01,
    prerequisite_failed: false,
    block_maxima,
    param_label: `M=${M}, N=${N}, K=${K}`,
  };
}

// ============================================================
// Simple PRNG for sequence generation
// ============================================================

/**
 * Mulberry32 — fast, decent-quality 32-bit PRNG
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let z = seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a binary sequence using the selected generator type.
 * @param {number} n - length in bits
 * @param {number} seed
 * @param {string} type - 'mt' | 'lcg_bad' | 'ones' | 'alternating'
 * @returns {Uint8Array}
 */
function generateSequence(n, seed, type) {
  const bits = new Uint8Array(n);

  if (type === 'ones') {
    bits.fill(1);
    return bits;
  }

  if (type === 'alternating') {
    for (let i = 0; i < n; i++) bits[i] = i & 1;
    return bits;
  }

  if (type === 'lcg_bad') {
    // Terrible LCG with small modulus — very non-random
    let state = (seed & 0xFFFF) || 1;
    for (let i = 0; i < n; i++) {
      state = (state * 1103515245 + 12345) & 0x7FFFFFFF;
      bits[i] = (state >> 11) & 1;
    }
    return bits;
  }

  // Default: Mulberry32 PRNG
  const rand = mulberry32(seed >>> 0);
  let buf = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (count === 0) { buf = (rand() * 0x100000000) >>> 0; count = 32; }
    bits[i] = buf & 1;
    buf >>>= 1;
    count--;
  }
  return bits;
}
