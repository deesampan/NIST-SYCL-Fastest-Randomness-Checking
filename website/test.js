/**
 * test.js — UI logic for the Live Test page
 */

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

  if (r.prerequisite_failed) {
    body = `
      <div class="rc-row warn-row">
        <span>Prerequisite failed</span>
        <span>${r.note}</span>
      </div>`;
  } else if (r.name === 'Runs Test') {
    body = renderRunsDetail(r);
  } else {
    body = renderLRDetail(r);
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
