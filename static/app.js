// ── CONFIG ──────────────────────────────────────────────────────
// FastAPI backend URL — must match where uvicorn is running
const API = 'http://localhost:8080';

// ── STATE ───────────────────────────────────────────────────────
const files   = { 1: null, 2: null };
let   results = null;

// ── THEME TOGGLE ────────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
const html        = document.documentElement;

// Restore saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ── FILE INPUT ──────────────────────────────────────────────────
function triggerInput(n) {
  document.getElementById(`file${n}`).click();
}

function onFileChange(n, input) {
  const file = input.files[0];
  if (file) applyFile(n, file);
}

function applyFile(n, file) {
  files[n] = file;
  document.getElementById(`img${n}`).src  = URL.createObjectURL(file);
  document.getElementById(`name${n}`).textContent = file.name;
  document.getElementById(`zone${n}`).classList.add('has-file');
  updateStatus();
}

function clearFile(e, n) {
  e.stopPropagation();
  files[n] = null;
  document.getElementById(`file${n}`).value = '';
  document.getElementById(`img${n}`).src    = '';
  document.getElementById(`zone${n}`).classList.remove('has-file');
  updateStatus();
}

// ── DRAG & DROP ─────────────────────────────────────────────────
function onDragOver(e, n) {
  e.preventDefault();
  document.getElementById(`zone${n}`).classList.add('dragover');
}
function onDragLeave(n) {
  document.getElementById(`zone${n}`).classList.remove('dragover');
}
function onDrop(e, n) {
  e.preventDefault();
  document.getElementById(`zone${n}`).classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById(`file${n}`).files = dt.files;
    applyFile(n, file);
  }
}

// ── STATUS LINE ─────────────────────────────────────────────────
function setStatus(msg, type = '') {
  const el = document.getElementById('statusLine');
  el.textContent = msg;
  el.className   = 'status-line ' + type;
}

function updateStatus() {
  const both = files[1] && files[2];
  const one  = files[1] || files[2];
  if (both)      setStatus('Both images ready — click Analyze.', 'ok');
  else if (one)  setStatus('Upload the second drawing to continue.', 'warn');
  else           setStatus('Upload both drawings to begin');
}

// ── RING ANIMATION ──────────────────────────────────────────────
const CIRCUMFERENCE = 2 * Math.PI * 34; // r = 34

function animateRing(id, pct) {
  const ring   = document.getElementById(id);
  const offset = CIRCUMFERENCE * (1 - pct / 100);
  const color  = pct < 40 ? '#0e9f6e' : pct < 70 ? '#c27803' : '#e02424';

  ring.style.strokeDasharray  = CIRCUMFERENCE;
  ring.style.strokeDashoffset = CIRCUMFERENCE; // reset
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ring.style.strokeDashoffset = offset;
    ring.style.stroke           = color;
  }));
}

// ── DISPLAY RESULTS ─────────────────────────────────────────────
function showResults(r) {
  const avg   = r.avg_prob;
  const level = avg < 40 ? 'low' : avg < 70 ? 'moderate' : 'high';
  const label = avg < 40 ? 'Low Risk' : avg < 70 ? 'Moderate Risk' : 'High Risk';

  // Ring values
  document.getElementById('val1').textContent = r.model1_prob + '%';
  document.getElementById('val2').textContent = r.model2_prob + '%';

  // Centre final score
  document.getElementById('finalPct').textContent = avg;
  document.getElementById('finalPct').style.color =
    avg < 40 ? 'var(--green)' : avg < 70 ? 'var(--amber)' : 'var(--red)';

  // Risk badge
  const badge = document.getElementById('riskBadge');
  badge.textContent = label;
  badge.className   = 'risk-badge ' + level;

  // Animate rings and bar
  setTimeout(() => {
    animateRing('ring1', r.model1_prob);
    animateRing('ring2', r.model2_prob);
    document.getElementById('barFill').style.width = avg + '%';
  }, 100);

  // Recommendation box
  const rec = document.getElementById('recommendation');
  const recMessages = {
    low:      '✅ <strong>Low Risk Detected.</strong> The drawings show no significant tremor indicators. No immediate clinical concern — routine check-up is suggested.',
    moderate: '⚠️ <strong>Moderate Risk Detected.</strong> The drawings exhibit some irregularities. Follow-up with a neurologist for further clinical assessment is advised.',
    high:     '🚨 <strong>High Risk Detected.</strong> The drawings show significant tremor patterns consistent with Parkinson\'s motor dysfunction. Immediate neurological consultation is strongly recommended.'
  };
  rec.innerHTML  = recMessages[level];
  rec.className  = 'recommendation show ' + level;

  // Show results block
  document.getElementById('resultsBlock').style.display = 'block';
  document.getElementById('resultsBlock').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Demo mode warning
  if (r.demo_mode) {
    setStatus('⚠ Demo mode — real models not loaded. Run uvicorn to connect.', 'warn');
  } else {
    setStatus('Analysis complete.', 'ok');
  }
}

// ── RUN ANALYSIS ────────────────────────────────────────────────
async function runAnalysis() {
  if (!files[1] || !files[2]) {
    setStatus('Please upload both drawings first.', 'error');
    return;
  }

  const btn     = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');
  const btnText = document.getElementById('btnText');

  // Loading state
  btn.disabled          = true;
  spinner.style.display = 'block';
  btnText.textContent   = 'Analyzing…';
  setStatus('Sending images to backend…');

  const form = new FormData();
  form.append('spiral',      files[1]);
  form.append('handwriting', files[2]);

  try {
    const res = await fetch(`${API}/analyze`, { method: 'POST', body: form });

    if (!res.ok) {
      // FastAPI sends errors as { detail: "..." }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    results = await res.json();
    showResults(results);

  } catch (err) {
    const isNetworkError = (
      err.message.includes('Failed to fetch') ||
      err.message.includes('NetworkError') ||
      err.message.includes('ERR_CONNECTION_REFUSED')
    );

    if (isNetworkError) {
      // Backend not running — show demo results
      console.warn('Backend unreachable, using demo data.');
      results = {
        model1_prob: 74,
        model2_prob: 61,
        avg_prob:    67.5,
        demo_mode:   true,
      };
      showResults(results);
    } else {
      // Real API error — show it
      setStatus(`Error: ${err.message}`, 'error');
    }
  } finally {
    btn.disabled          = false;
    spinner.style.display = 'none';
    btnText.textContent   = 'Re-Analyze';
  }
}
