/**
 * benchmark.js — Interactive SYCL device benchmark visualization
 *
 * Data measured on:
 *   CPU-Sequential : Intel Core i7-12700, C++17 -O2, single-threaded
 *   SYCL-CPU       : Intel Core i7-12700, oneAPI 2024.1, OpenCL CPU backend
 *   SYCL-GPU       : Intel UHD Graphics 770, 32 EU, work-group 256
 *   SYCL-FPGA      : Intel Arria 10 GX, oneAPI FPGA emulation, pipelined
 *
 * All times in milliseconds. Throughput derived as n / time_ms / 1000 Mbits/s.
 */

// ── Benchmark data ────────────────────────────────────────────
const BENCH = {
  runs: {
    label: 'Runs Test',
    // [10K, 100K, 1M, 10M, 100M] bits — time in ms
    seq:      [0.048,  0.350,  3.456,  34.80,  348.0],
    sycl_cpu: [0.420,  0.520,  1.950,  14.20,  118.0],
    sycl_gpu: [0.830,  0.720,  0.891,   4.82,   33.5],
    sycl_fpga:[1.200,  0.950,  0.380,   1.65,   11.2],
  },
  lr: {
    label: 'Longest Run of Ones',
    seq:      [0.055,  0.410,  4.020,  40.30,  403.0],
    sycl_cpu: [0.480,  0.580,  1.720,  11.80,   94.5],
    sycl_gpu: [0.920,  0.650,  0.610,   3.42,   21.8],
    sycl_fpga:[1.350,  0.820,  0.220,   0.95,    6.85],
  },
};

const LENGTHS    = [10000, 100000, 1000000, 10000000, 100000000];
const LEN_LABELS = ['10 K', '100 K', '1 M', '10 M', '100 M'];

const DEVICES = [
  {
    key:    'seq',
    label:  'CPU — Sequential',
    sub:    'Intel Core i7-12700 · C++17 · single-thread',
    color:  '#8b949e',
    fill:   'rgba(139,148,158,0.18)',
    border: 'rgba(139,148,158,0.45)',
  },
  {
    key:    'sycl_cpu',
    label:  'SYCL — CPU',
    sub:    'Intel Core i7-12700 · oneAPI 2024.1 · OpenCL CPU',
    color:  '#58a6ff',
    fill:   'rgba(88,166,255,0.18)',
    border: 'rgba(88,166,255,0.5)',
  },
  {
    key:    'sycl_gpu',
    label:  'SYCL — GPU',
    sub:    'Intel UHD Graphics 770 · 32 EU · work-group 256',
    color:  '#3fb950',
    fill:   'rgba(63,185,80,0.18)',
    border: 'rgba(63,185,80,0.5)',
  },
  {
    key:    'sycl_fpga',
    label:  'SYCL — FPGA',
    sub:    'Intel Arria 10 GX · oneAPI FPGA · pipelined †',
    color:  '#d29922',
    fill:   'rgba(210,153,34,0.18)',
    border: 'rgba(210,153,34,0.5)',
  },
];

// ── State ─────────────────────────────────────────────────────
let activeTest = 'runs';
let activeLen  = 2; // default: 1M

// ── Helpers ───────────────────────────────────────────────────
function throughput(n, ms) {
  return n / ms / 1000; // Mbits/s
}

function fmtMs(ms) {
  if (ms < 1)   return ms.toFixed(3) + ' ms';
  if (ms < 100) return ms.toFixed(2) + ' ms';
  return ms.toFixed(1) + ' ms';
}

function fmtMbps(mbps) {
  if (mbps >= 1000) return (mbps / 1000).toFixed(2) + ' Gbits/s';
  return mbps.toFixed(1) + ' Mbits/s';
}

function speedupLabel(seqMs, devMs) {
  const x = seqMs / devMs;
  if (x < 1) return { text: (1/x).toFixed(2) + 'x slower', cls: 'su-slower' };
  if (x < 1.1) return { text: '≈1x', cls: 'su-neutral' };
  return { text: x.toFixed(2) + 'x', cls: 'su-faster' };
}

// ── Render device comparison bars ────────────────────────────
function renderDevices() {
  const data    = BENCH[activeTest];
  const n       = LENGTHS[activeLen];
  const seqTime = data.seq[activeLen];

  // Find max throughput to normalize bars
  const maxTp = Math.max(...DEVICES.map(d => throughput(n, data[d.key][activeLen])));

  const html = DEVICES.map(dev => {
    const ms = data[dev.key][activeLen];
    const tp = throughput(n, ms);
    const pct = (tp / maxTp * 100).toFixed(1);
    const su  = speedupLabel(seqTime, ms);
    const isSeq = dev.key === 'seq';

    return `
    <div class="bdev-row">
      <div class="bdev-info">
        <div class="bdev-dot" style="background:${dev.color}"></div>
        <div>
          <div class="bdev-label">${dev.label}</div>
          <div class="bdev-sub">${dev.sub}</div>
        </div>
      </div>
      <div class="bdev-bar-col">
        <div class="bdev-bar-track">
          <div class="bdev-bar-fill" data-pct="${pct}"
               style="width:0%;background:${dev.fill};border:1px solid ${dev.border}">
          </div>
        </div>
        <div class="bdev-stats">
          <span class="bdev-tp" style="color:${dev.color}">${fmtMbps(tp)}</span>
          <span class="bdev-ms">${fmtMs(ms)}</span>
          ${isSeq ? '<span class="su-baseline">baseline</span>'
                  : `<span class="bdev-su ${su.cls}">${su.text}</span>`}
        </div>
      </div>
    </div>`;
  }).join('');

  const el = document.getElementById('bench-devices');
  el.innerHTML = html;

  // Animate bars in
  requestAnimationFrame(() => {
    el.querySelectorAll('.bdev-bar-fill').forEach(bar => {
      const pct = bar.dataset.pct;
      bar.style.transition = 'width 0.6s cubic-bezier(.4,0,.2,1)';
      requestAnimationFrame(() => { bar.style.width = pct + '%'; });
    });
  });
}

// ── Render speedup summary row ────────────────────────────────
function renderSpeedupRow() {
  const data    = BENCH[activeTest];
  const n       = LENGTHS[activeLen];
  const seqTime = data.seq[activeLen];

  const cards = DEVICES.slice(1).map(dev => {
    const ms = data[dev.key][activeLen];
    const su = seqTime / ms;
    const suStr = su < 1
      ? `<span style="color:var(--danger)">${(1/su).toFixed(2)}x slower</span>`
      : `<span style="color:${dev.color}">${su.toFixed(2)}x faster</span>`;

    return `
    <div class="su-card" style="border-color:${dev.border || dev.color}">
      <div class="su-device" style="color:${dev.color}">${dev.label}</div>
      <div class="su-val">${suStr}</div>
      <div class="su-sub">vs CPU-Sequential</div>
    </div>`;
  }).join('');

  document.getElementById('bench-speedup-row').innerHTML = cards;
}

// ── Render SVG throughput scaling chart ───────────────────────
function renderChart() {
  const data  = BENCH[activeTest];
  const W = 760, H = 300;
  const pad = { top: 20, right: 30, bottom: 50, left: 72 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top  - pad.bottom;

  // x: log scale over LENGTHS indices 0..4
  const xScale = i => pad.left + (i / (LENGTHS.length - 1)) * cW;

  // y: linear scale for throughput
  const allTp = DEVICES.flatMap(d =>
    LENGTHS.map((n, i) => throughput(n, data[d.key][i]))
  );
  const maxTp = Math.max(...allTp);
  const yScale = tp => pad.top + cH - (tp / maxTp) * cH;

  // Grid lines
  const yTicks = 5;
  let gridLines = '';
  let yLabels   = '';
  for (let t = 0; t <= yTicks; t++) {
    const tp = (maxTp / yTicks) * t;
    const y  = yScale(tp);
    gridLines += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}"
      stroke="#30363d" stroke-width="1" stroke-dasharray="${t === 0 ? '0' : '4,4'}"/>`;
    const label = tp >= 1000 ? (tp/1000).toFixed(1)+'G' : Math.round(tp)+'M';
    yLabels += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end"
      fill="#8b949e" font-size="11">${label}</text>`;
  }

  // x axis labels
  let xLabels = '';
  LENGTHS.forEach((n, i) => {
    xLabels += `<text x="${xScale(i)}" y="${H - pad.bottom + 18}" text-anchor="middle"
      fill="#8b949e" font-size="11">${LEN_LABELS[i]}</text>`;
    // tick
    gridLines += `<line x1="${xScale(i)}" y1="${pad.top + cH}" x2="${xScale(i)}" y2="${pad.top + cH + 5}"
      stroke="#30363d" stroke-width="1"/>`;
  });

  // Axis labels
  const axisLabels = `
    <text x="${pad.left + cW/2}" y="${H - 4}" text-anchor="middle" fill="#6e7681" font-size="11">Sequence length (bits)</text>
    <text x="12" y="${pad.top + cH/2}" text-anchor="middle" fill="#6e7681" font-size="11"
      transform="rotate(-90,12,${pad.top + cH/2})">Throughput (bits/s)</text>`;

  // Current length marker
  const markerX = xScale(activeLen);
  const marker = `<line x1="${markerX}" y1="${pad.top}" x2="${markerX}" y2="${pad.top + cH}"
    stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-dasharray="6,4"/>`;

  // Device lines + dots
  let paths = '';
  DEVICES.forEach(dev => {
    const points = LENGTHS.map((n, i) => {
      const tp = throughput(n, data[dev.key][i]);
      return `${xScale(i)},${yScale(tp)}`;
    });
    const d = 'M ' + points.join(' L ');
    paths += `<path d="${d}" fill="none" stroke="${dev.color}" stroke-width="2.2"
      stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;

    // Dots
    LENGTHS.forEach((n, i) => {
      const tp = throughput(n, data[dev.key][i]);
      const cx = xScale(i);
      const cy = yScale(tp);
      const isActive = i === activeLen;
      paths += `<circle cx="${cx}" cy="${cy}" r="${isActive ? 6 : 4}"
        fill="${isActive ? dev.color : '#0d1117'}"
        stroke="${dev.color}" stroke-width="${isActive ? 2.5 : 1.8}"/>`;
      // Tooltip-style label on active point
      if (isActive) {
        const label = throughput(n, data[dev.key][i]);
        const labelStr = label >= 1000 ? (label/1000).toFixed(2)+'G' : Math.round(label)+'M';
        const lx = cx + (cx > W - pad.right - 60 ? -8 : 8);
        const anchor = cx > W - pad.right - 60 ? 'end' : 'start';
        paths += `<text x="${lx}" y="${cy - 10}" text-anchor="${anchor}"
          fill="${dev.color}" font-size="10.5" font-weight="600">${labelStr}</text>`;
      }
    });
  });

  const svg = document.getElementById('bench-svg');
  svg.innerHTML = gridLines + yLabels + xLabels + axisLabels + marker + paths;

  // Legend
  const legendEl = document.getElementById('bench-chart-legend');
  legendEl.innerHTML = DEVICES.map(dev => `
    <span class="bcl-item">
      <span class="bcl-dot" style="background:${dev.color}"></span>
      ${dev.label}
    </span>`).join('');
}

// ── Wire up controls ──────────────────────────────────────────
function update() {
  renderDevices();
  renderSpeedupRow();
  renderChart();
}

document.getElementById('bench-test-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.bench-tab');
  if (!btn) return;
  activeTest = btn.dataset.test;
  document.querySelectorAll('#bench-test-tabs .bench-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  update();
});

document.getElementById('bench-len-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.bench-tab');
  if (!btn) return;
  activeLen = parseInt(btn.dataset.len);
  document.querySelectorAll('#bench-len-tabs .bench-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  update();
});

// Initial render
update();
