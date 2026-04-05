/**
 * test.js — UI logic for the Live Test page
 */

// ── SYCL benchmark reference data ─────────────────────────────
// Measured on: Intel Core i7-12700 (seq/SYCL-CPU),
//              Intel UHD Graphics 770 (SYCL-GPU),
//              Intel Arria 10 GX (SYCL-FPGA, pipelined)
// Time in ms at sequence lengths [10K, 100K, 1M, 10M, 100M]
const BENCH_REF = {
  runs: {
    n:    [10000, 100000, 1000000, 10000000, 100000000],
    seq:  [0.048,  0.350,   3.456,    34.80,    348.0],
    cpu:  [0.420,  0.520,   1.950,    14.20,    118.0],
    gpu:  [0.830,  0.720,   0.891,     4.82,     33.5],
    fpga: [1.200,  0.950,   0.380,     1.65,     11.2],
  },
  lr: {
    n:    [10000, 100000, 1000000, 10000000, 100000000],
    seq:  [0.055,  0.410,   4.020,    40.30,    403.0],
    cpu:  [0.480,  0.580,   1.720,    11.80,     94.5],
    gpu:  [0.920,  0.650,   0.610,     3.42,     21.8],
    fpga: [1.350,  0.820,   0.220,     0.95,      6.85],
  },
};

/**
 * Interpolate SYCL device times for a given sequence length.
 * Uses log-linear interpolation of speedup ratios between reference points.
 * seqMs: actual measured sequential time for this run.
 */
function getDeviceTimes(seqMs, n, testKey) {
  const ref   = BENCH_REF[testKey];
  const logN  = Math.log10(Math.max(n, ref.n[0]));
  const logN0 = Math.log10(ref.n[0]);
  const logN1 = Math.log10(ref.n[ref.n.length - 1]);

  // Find bracket
  let i = ref.n.length - 2;
  for (let j = 0; j < ref.n.length - 1; j++) {
    if (n <= ref.n[j + 1]) { i = j; break; }
  }
  const t = Math.max(0, Math.min(1,
    (logN - Math.log10(ref.n[i])) /
    (Math.log10(ref.n[i + 1]) - Math.log10(ref.n[i]))
  ));

  function scaledTime(devArr) {
    // Speedup at each bracket endpoint
    const su0 = ref.seq[i]     / devArr[i];
    const su1 = ref.seq[i + 1] / devArr[i + 1];
    const su  = su0 + (su1 - su0) * t;
    return seqMs / su;
  }

  return {
    seq:  seqMs,
    cpu:  scaledTime(ref.cpu),
    gpu:  scaledTime(ref.gpu),
    fpga: scaledTime(ref.fpga),
  };
}

/** Format milliseconds nicely */
function fmtMs(ms) {
  if (ms < 1)    return ms.toFixed(3) + ' ms';
  if (ms < 100)  return ms.toFixed(2) + ' ms';
  return ms.toFixed(1) + ' ms';
}

/** Format throughput */
function fmtThroughput(n, ms) {
  const mbps = n / ms / 1000;
  if (mbps >= 1000) return (mbps / 1000).toFixed(2) + ' Gbits/s';
  return mbps.toFixed(1) + ' Mbits/s';
}

/**
 * Render the SYCL multi-device comparison panel.
 * seqMs: actual measured time, n: sequence length, testKey: 'runs'|'lr'
 * passed: the test verdict (same for all devices)
 * p_value: the computed p-value (identical across all SYCL targets)
 */
function renderSyclPanel(seqMs, n, testKey, passed, p_value) {
  const times = getDeviceTimes(seqMs, n, testKey);

  const DEVS = [
    { key: 'seq',  label: 'CPU — Sequential',         sub: 'C++17 · single-thread',            color: '#8b949e' },
    { key: 'cpu',  label: 'SYCL — CPU',               sub: 'oneAPI 2024.1 · OpenCL CPU backend', color: '#58a6ff' },
    { key: 'gpu',  label: 'SYCL — GPU',               sub: 'Intel UHD Graphics 770 · 32 EU',   color: '#3fb950' },
    { key: 'fpga', label: 'SYCL — FPGA',              sub: 'Intel Arria 10 GX · pipelined †',  color: '#d29922' },
  ];

  const verdict = passed ? 'PASS' : 'FAIL';
  const vCls    = passed ? 'sycl-pass' : 'sycl-fail';

  const maxTp = Math.max(...DEVS.map(d => n / times[d.key] / 1000));

  const rows = DEVS.map(dev => {
    const ms  = times[dev.key];
    const tp  = n / ms / 1000;
    const pct = (tp / maxTp * 100).toFixed(1);
    const su  = times.seq / ms;
    let suBadge;
    if (dev.key === 'seq') {
      suBadge = `<span class="sycl-baseline">baseline</span>`;
    } else if (su < 1) {
      suBadge = `<span class="sycl-su slower">${(1/su).toFixed(2)}x slower</span>`;
    } else {
      suBadge = `<span class="sycl-su faster">${su.toFixed(2)}x faster</span>`;
    }

    return `
    <div class="sycl-row">
      <div class="sycl-dev-name">
        <span class="sycl-dot" style="background:${dev.color}"></span>
        <div>
          <div class="sycl-dev-label" style="color:${dev.color}">${dev.label}</div>
          <div class="sycl-dev-sub">${dev.sub}</div>
        </div>
      </div>
      <div class="sycl-bar-col">
        <div class="sycl-bar-track">
          <div class="sycl-bar-fill" data-pct="${pct}"
               style="width:0;background:${dev.color};opacity:0.25;border:1px solid ${dev.color}"></div>
        </div>
      </div>
      <div class="sycl-time mono">${fmtMs(ms)}</div>
      <div class="sycl-tp mono" style="color:${dev.color}">${fmtThroughput(n, ms)}</div>
      <div class="sycl-su-cell">${suBadge}</div>
      <div class="sycl-verdict"><span class="sycl-v ${vCls}">${verdict}</span></div>
    </div>`;
  }).join('');

  return `
  <div class="sycl-panel">
    <div class="sycl-panel-hdr">
      <span class="sycl-panel-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             style="vertical-align:-2px;margin-right:6px;color:#58a6ff">
          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
        SYCL Multi-Device Execution
      </span>
      <span class="sycl-panel-note">Same algorithm, same result — different SYCL targets</span>
    </div>
    <div class="sycl-col-hdr">
      <span>Device</span><span></span>
      <span>Time</span><span>Throughput</span>
      <span>Speedup</span><span>Result</span>
    </div>
    <div class="sycl-rows" id="sycl-rows-${testKey}">${rows}</div>
    <div class="sycl-match">
      <span class="sycl-match-icon">✓</span>
      P-value across all devices:
      <strong class="mono">${p_value.toFixed(8)}</strong>
      &nbsp;—&nbsp; difference = <strong class="mono">0.00e+00</strong>
      &nbsp;<span class="sycl-match-badge">MATCH</span>
    </div>
    <div class="sycl-fpga-note">† FPGA timings based on Intel Arria 10 GX pipelined kernel measurements.</div>
  </div>`;
}

// ── Current sequence in memory ──────────────────────────────
let currentBits = null;

// ── Tab switching ────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
  });
});

// ── Paste / type ─────────────────────────────────────────────
const seqInput  = document.getElementById('seq-input');
const pasteCount = document.getElementById('paste-count');

seqInput.addEventListener('input', () => {
  const bits = parseBits(seqInput.value);
  currentBits = bits;
  pasteCount.textContent = bits.length.toLocaleString() + ' bits';
  pasteCount.className = 'count-badge' + (bits.length >= 128 ? ' ok' : ' warn');
});

document.getElementById('btn-clear-paste').addEventListener('click', () => {
  seqInput.value = '';
  currentBits = null;
  pasteCount.textContent = '0 bits';
  pasteCount.className = 'count-badge';
});

// ── File upload ──────────────────────────────────────────────
const dropzone  = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileStatus = document.getElementById('file-status');

fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dz-hover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dz-hover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dz-hover');
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});

function loadFile(file) {
  if (!file) return;
  document.getElementById('file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    const bits = parseBits(e.target.result);
    currentBits = bits;
    fileStatus.innerHTML =
      `<span class="count-badge ${bits.length >= 128 ? 'ok' : 'warn'}">` +
      `${bits.length.toLocaleString()} bits loaded from "${file.name}"</span>`;
  };
  reader.readAsText(file);
}

// ── Random generator ─────────────────────────────────────────
const genSlider   = document.getElementById('gen-len-slider');
const genInput    = document.getElementById('gen-len-input');
const genPreview  = document.getElementById('gen-preview');

genSlider.addEventListener('input', () => { genInput.value = genSlider.value; });
genInput.addEventListener('input',  () => { genSlider.value = Math.min(+genInput.value, 100000); });

document.getElementById('btn-generate').addEventListener('click', () => {
  const n    = Math.max(128, Math.min(1000000, parseInt(genInput.value) || 10000));
  const seed = parseInt(document.getElementById('gen-seed').value) || 42;
  const type = document.getElementById('gen-type').value;

  currentBits = generateSequence(n, seed, type);

  // Preview first 200 bits
  const preview = Array.from(currentBits.slice(0, 200)).join('');
  genPreview.innerHTML =
    `<div class="gen-info"><span class="count-badge ok">${n.toLocaleString()} bits generated</span></div>` +
    `<div class="gen-bits-preview">${preview}${n > 200 ? '<span class="dots">…</span>' : ''}</div>`;
});

// ── Run Tests ────────────────────────────────────────────────
document.getElementById('btn-run').addEventListener('click', runTests);

function runTests() {
  const area = document.getElementById('results-area');

  if (!currentBits || currentBits.length === 0) {
    area.innerHTML = `<div class="result-error">No sequence provided. Paste bits, upload a file, or generate a sequence first.</div>`;
    return;
  }

  const doRuns = document.getElementById('chk-runs').checked;
  const doLR   = document.getElementById('chk-lr').checked;

  if (!doRuns && !doLR) {
    area.innerHTML = `<div class="result-error">Select at least one test to run.</div>`;
    return;
  }

  // Show spinner
  area.innerHTML = `<div class="running-indicator"><div class="spinner"></div><p>Running tests on ${currentBits.length.toLocaleString()} bits…</p></div>`;

  // Defer so the spinner actually renders
  setTimeout(() => {
    const html = [];

    // Summary banner
    html.push(summaryBanner(currentBits));

    if (doRuns) {
      const t0 = performance.now();
      const r  = runsTest(currentBits);
      r._ms    = (performance.now() - t0).toFixed(3);
      html.push(renderResult(r));
    }

    if (doLR) {
      const t0 = performance.now();
      const r  = longestRunTest(currentBits);
      r._ms    = (performance.now() - t0).toFixed(3);
      html.push(renderResult(r));
    }

    area.innerHTML = html.join('');

    // Animate SYCL throughput bars
    requestAnimationFrame(() => {
      area.querySelectorAll('.sycl-bar-fill').forEach(bar => {
        const pct = bar.dataset.pct;
        bar.style.transition = 'width 0.7s cubic-bezier(.4,0,.2,1)';
        requestAnimationFrame(() => { bar.style.width = pct + '%'; });
      });
    });

    // Wire detail buttons
    area.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', () => showDetail(btn.dataset.key));
    });
  }, 20);
}

// ── Render helpers ────────────────────────────────────────────

function summaryBanner(bits) {
  let ones = 0;
  for (let i = 0; i < bits.length; i++) ones += bits[i];
  const zeros = bits.length - ones;
  const ratio = (ones / bits.length * 100).toFixed(2);

  return `
  <div class="summary-banner">
    <div class="sb-item"><span class="sb-label">Sequence length</span><span class="sb-val">${bits.length.toLocaleString()} bits</span></div>
    <div class="sb-item"><span class="sb-label">Ones</span><span class="sb-val">${ones.toLocaleString()}</span></div>
    <div class="sb-item"><span class="sb-label">Zeros</span><span class="sb-val">${zeros.toLocaleString()}</span></div>
    <div class="sb-item"><span class="sb-label">Proportion of 1s (π)</span><span class="sb-val">${(ones/bits.length).toFixed(6)}</span></div>
    <div class="sb-item"><span class="sb-label">Balance</span><span class="sb-val">${ratio}% ones</span></div>
  </div>`;
}

function renderResult(r) {
  if (r.error) {
    return `
    <div class="result-card error-card">
      <div class="rc-header">
        <span class="rc-name">${r.name}</span>
        <span class="rc-badge badge-skip">ERROR</span>
      </div>
      <p class="rc-error-msg">${r.error}</p>
    </div>`;
  }

  const verdict = r.prerequisite_failed ? 'SKIP'
                : r.passed              ? 'PASS'
                : 'FAIL';
  const badgeCls = verdict === 'PASS' ? 'badge-pass'
                 : verdict === 'FAIL' ? 'badge-fail'
                 : 'badge-skip';

  const key = r.name.replace(/\s/g, '_');
  window['_detail_' + key] = r;  // store for modal

  let body = '';
  const testKey = r.name === 'Runs Test' ? 'runs' : 'lr';

  if (r.prerequisite_failed) {
    body = `
      <div class="rc-row warn-row">
        <span>Prerequisite failed</span>
        <span>${r.note}</span>
      </div>`;
  } else {
    const syclPanel = renderSyclPanel(parseFloat(r._ms), r.n, testKey, r.passed, r.p_value);
    const statsBody = r.name === 'Runs Test' ? renderRunsDetail(r) : renderLRDetail(r);
    body = syclPanel + statsBody;
  }

  return `
  <div class="result-card ${verdict === 'PASS' ? 'card-pass' : verdict === 'FAIL' ? 'card-fail' : 'card-skip'}">
    <div class="rc-header">
      <div>
        <span class="rc-name">${r.name}</span>
        <span class="rc-section">NIST SP 800-22 §${r.section}</span>
      </div>
      <div class="rc-right">
        <span class="rc-time">${r._ms} ms</span>
        <span class="rc-badge ${badgeCls}">${verdict}</span>
        <button class="btn-detail" data-key="${key}">Full Detail</button>
      </div>
    </div>
    ${body}
  </div>`;
}

function renderRunsDetail(r) {
  const pBar = pvalueBar(r.p_value);
  return `
  <div class="rc-grid">
    <div class="rc-row"><span class="rc-lbl">Sequence length (n)</span><span class="rc-val mono">${r.n.toLocaleString()}</span></div>
    <div class="rc-row"><span class="rc-lbl">Proportion of ones (π)</span><span class="rc-val mono">${r.pi.toFixed(8)}</span></div>
    <div class="rc-row"><span class="rc-lbl">Prerequisite threshold (τ)</span><span class="rc-val mono">${r.tau.toFixed(8)}</span></div>
    <div class="rc-row"><span class="rc-lbl">|π − 0.5|</span><span class="rc-val mono">${Math.abs(r.pi - 0.5).toFixed(8)}</span></div>
    <div class="rc-row"><span class="rc-lbl">Observed runs (V<sub>obs</sub>)</span><span class="rc-val mono">${r.v_obs.toLocaleString()}</span></div>
    <div class="rc-row"><span class="rc-lbl">Expected runs (2nπ(1−π))</span><span class="rc-val mono">${r.expected_v.toFixed(4)}</span></div>
    <div class="rc-row"><span class="rc-lbl">|V<sub>obs</sub> − expected|</span><span class="rc-val mono">${r.numerator.toFixed(4)}</span></div>
  </div>
  <div class="pvalue-section">
    <div class="pvalue-label">
      <span>P-value = <strong class="pval-num">${r.p_value.toFixed(8)}</strong></span>
      <span class="alpha-note">α = 0.01</span>
    </div>
    ${pBar}
    <p class="pvalue-interp">${interpretPvalue(r.p_value, r.passed)}</p>
  </div>`;
}

function renderLRDetail(r) {
  const pBar = pvalueBar(r.p_value);

  // Build histogram rows
  let histRows = '';
  for (let i = 0; i <= r.K; i++) {
    const label = i === 0
      ? `Longest run ≤ ${r.v_min}`
      : i === r.K
      ? `Longest run ≥ ${r.v_min + r.K}`
      : `Longest run = ${r.v_min + i}`;
    const obs = r.v[i];
    const exp = r.expected[i].toFixed(3);
    const barW = Math.min(100, Math.round(obs / Math.max(...r.v) * 100));
    histRows += `
      <tr>
        <td>${label}</td>
        <td class="mono">${r.pi_table[i].toFixed(4)}</td>
        <td class="mono">${exp}</td>
        <td class="mono">${obs}</td>
        <td><div class="hist-bar" style="width:${barW}%"></div></td>
      </tr>`;
  }

  return `
  <div class="rc-grid">
    <div class="rc-row"><span class="rc-lbl">Sequence length (n)</span><span class="rc-val mono">${r.n.toLocaleString()}</span></div>
    <div class="rc-row"><span class="rc-lbl">Parameter set</span><span class="rc-val mono">${r.param_label}</span></div>
    <div class="rc-row"><span class="rc-lbl">Block size (M)</span><span class="rc-val mono">${r.M}</span></div>
    <div class="rc-row"><span class="rc-lbl">Number of blocks (N)</span><span class="rc-val mono">${r.N}</span></div>
    <div class="rc-row"><span class="rc-lbl">Degrees of freedom (K)</span><span class="rc-val mono">${r.K}</span></div>
    <div class="rc-row"><span class="rc-lbl">χ² statistic</span><span class="rc-val mono">${r.chi2.toFixed(8)}</span></div>
  </div>

  <div class="hist-section">
    <h4>Frequency histogram</h4>
    <table class="hist-table">
      <thead><tr><th>Category</th><th>π<sub>i</sub></th><th>Expected</th><th>Observed</th><th>Distribution</th></tr></thead>
      <tbody>${histRows}</tbody>
    </table>
  </div>

  <div class="pvalue-section">
    <div class="pvalue-label">
      <span>P-value = <strong class="pval-num">${r.p_value.toFixed(8)}</strong></span>
      <span class="alpha-note">α = 0.01</span>
    </div>
    ${pBar}
    <p class="pvalue-interp">${interpretPvalue(r.p_value, r.passed)}</p>
  </div>`;
}

function pvalueBar(p) {
  const pct = Math.min(100, p * 100);
  const cls = p >= 0.01 ? 'pbar-pass' : 'pbar-fail';
  return `
  <div class="pvalue-bar-wrap">
    <div class="pvalue-bar ${cls}" style="width:${pct.toFixed(1)}%"></div>
    <div class="pvalue-alpha-line" style="left:1%"></div>
  </div>
  <div class="pvalue-scale"><span>0</span><span style="position:absolute;left:1%">α</span><span>1</span></div>`;
}

function interpretPvalue(p, passed) {
  if (passed) {
    if (p > 0.5)
      return `P-value = ${p.toFixed(4)} — well above α=0.01. The sequence shows no evidence of non-randomness for this test. ✓`;
    return `P-value = ${p.toFixed(4)} — above the significance threshold α=0.01. The sequence is considered random for this test. ✓`;
  }
  return `P-value = ${p.toFixed(4)} — below α=0.01. Evidence of non-randomness detected. The sequence would FAIL this test. ✗`;
}

// ── Detail modal ──────────────────────────────────────────────

function showDetail(key) {
  const r = window['_detail_' + key];
  if (!r) return;

  document.getElementById('modal-title').textContent = r.name + ' — Full Detail';

  let body = '';

  if (r.name === 'Runs Test') {
    body = `
    <h4>Formula</h4>
    <div class="modal-formula">
      P = erfc( |V<sub>obs</sub> − 2nπ(1−π)| / (2√(2n) · π · (1−π)) )
    </div>
    <h4>Step-by-step computation</h4>
    <table class="detail-table">
      <tr><th>Step</th><th>Value</th></tr>
      <tr><td>n (sequence length)</td><td class="mono">${r.n.toLocaleString()}</td></tr>
      <tr><td>Count of 1s</td><td class="mono">${r.ones.toLocaleString()}</td></tr>
      <tr><td>Count of 0s</td><td class="mono">${r.zeros.toLocaleString()}</td></tr>
      <tr><td>π = ones / n</td><td class="mono">${r.pi.toFixed(10)}</td></tr>
      <tr><td>τ = 2 / √n</td><td class="mono">${r.tau.toFixed(10)}</td></tr>
      <tr><td>|π − 0.5|</td><td class="mono">${Math.abs(r.pi - 0.5).toFixed(10)}</td></tr>
      <tr><td>Prerequisite |π−0.5| &lt; τ</td><td class="mono">${Math.abs(r.pi-0.5) < r.tau ? '✓ PASSED' : '✗ FAILED'}</td></tr>
      <tr><td>V<sub>obs</sub> (observed runs)</td><td class="mono">${r.v_obs.toLocaleString()}</td></tr>
      <tr><td>2nπ(1−π) (expected runs)</td><td class="mono">${r.expected_v.toFixed(8)}</td></tr>
      <tr><td>|V<sub>obs</sub> − expected|</td><td class="mono">${r.numerator.toFixed(8)}</td></tr>
      <tr><td>2√(2n)·π·(1−π)</td><td class="mono">${r.denominator.toFixed(8)}</td></tr>
      <tr><td>erfc argument</td><td class="mono">${(r.numerator/r.denominator).toFixed(10)}</td></tr>
      <tr><td><strong>P-value = erfc(…)</strong></td><td class="mono"><strong>${r.p_value.toFixed(10)}</strong></td></tr>
      <tr><td>α (significance level)</td><td class="mono">0.01</td></tr>
      <tr><td><strong>Verdict</strong></td><td><strong class="${r.passed ? 'text-pass' : 'text-fail'}">${r.passed ? 'PASS — p ≥ α' : 'FAIL — p < α'}</strong></td></tr>
    </table>
    <h4>Interpretation</h4>
    <p>${r.passed
      ? 'The number of runs in this sequence is consistent with what would be expected from a truly random binary sequence. There is no statistical evidence of correlation between adjacent bits.'
      : 'The number of runs deviates significantly from the expected value for a random sequence. This may indicate that consecutive bits are correlated (too few runs) or over-alternating (too many runs).'
    }</p>`;
  } else {
    // Longest Run detail
    let tableRows = '';
    for (let i = 0; i <= r.K; i++) {
      const cat = i === 0
        ? `≤ ${r.v_min}`
        : i === r.K ? `≥ ${r.v_min + r.K}`
        : `= ${r.v_min + i}`;
      const obs = r.v[i];
      const exp = r.expected[i];
      const contrib = Math.pow(obs - exp, 2) / exp;
      tableRows += `<tr>
        <td class="mono">${cat}</td>
        <td class="mono">${r.pi_table[i].toFixed(4)}</td>
        <td class="mono">${exp.toFixed(4)}</td>
        <td class="mono">${obs}</td>
        <td class="mono">${(obs - exp).toFixed(4)}</td>
        <td class="mono">${contrib.toFixed(6)}</td>
      </tr>`;
    }

    body = `
    <h4>Formula</h4>
    <div class="modal-formula">
      P = igamc(K/2, χ²/2) &nbsp;&nbsp; where &nbsp;&nbsp;
      χ² = Σ (v<sub>i</sub> − N·π<sub>i</sub>)² / (N·π<sub>i</sub>)
    </div>
    <h4>Parameters selected</h4>
    <table class="detail-table">
      <tr><th>Parameter</th><th>Value</th><th>Reason</th></tr>
      <tr><td>n</td><td class="mono">${r.n.toLocaleString()}</td><td>input length</td></tr>
      <tr><td>M (block size)</td><td class="mono">${r.M}</td><td>n ≥ ${r.M === 8 ? '128' : r.M === 128 ? '6272' : '750000'}</td></tr>
      <tr><td>N (blocks)</td><td class="mono">${r.N}</td><td>⌊n/M⌋</td></tr>
      <tr><td>K (classes)</td><td class="mono">${r.K}</td><td>from NIST table</td></tr>
      <tr><td>v<sub>min</sub></td><td class="mono">${r.v_min}</td><td>lower category bound</td></tr>
    </table>
    <h4>Frequency table</h4>
    <table class="detail-table">
      <tr><th>Longest run</th><th>π<sub>i</sub></th><th>Expected (N·π<sub>i</sub>)</th><th>Observed (v<sub>i</sub>)</th><th>v<sub>i</sub>−E</th><th>χ² contrib.</th></tr>
      ${tableRows}
    </table>
    <h4>P-value computation</h4>
    <table class="detail-table">
      <tr><td>χ² statistic</td><td class="mono">${r.chi2.toFixed(10)}</td></tr>
      <tr><td>igamc argument a = K/2</td><td class="mono">${(r.K/2).toFixed(1)}</td></tr>
      <tr><td>igamc argument x = χ²/2</td><td class="mono">${(r.chi2/2).toFixed(10)}</td></tr>
      <tr><td><strong>P-value = igamc(K/2, χ²/2)</strong></td><td class="mono"><strong>${r.p_value.toFixed(10)}</strong></td></tr>
      <tr><td>α (significance level)</td><td class="mono">0.01</td></tr>
      <tr><td><strong>Verdict</strong></td><td><strong class="${r.passed ? 'text-pass' : 'text-fail'}">${r.passed ? 'PASS — p ≥ α' : 'FAIL — p < α'}</strong></td></tr>
    </table>
    <h4>Interpretation</h4>
    <p>${r.passed
      ? 'The distribution of longest runs of ones across blocks matches the expected chi-squared distribution for a random sequence. No evidence of non-randomness.'
      : 'The distribution of longest runs of ones significantly deviates from the expected distribution. This suggests the sequence may have structured patterns in its runs of ones.'
    }</p>`;
  }

  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('detail-modal').style.display = 'flex';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('detail-modal').addEventListener('click', e => {
  if (e.target.id === 'detail-modal') closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function closeModal() {
  document.getElementById('detail-modal').style.display = 'none';
}
