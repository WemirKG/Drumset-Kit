// app.js (ES module)

// ---------------------
// Firebase Auth (Google-only) + Firestore entitlements
// ---------------------
// Uses Firebase web SDK docs: Google sign-in for web. :contentReference[oaicite:1]{index=1}
//
// If you do NOT want external dependencies, remove the Firebase sections and the drum kit still works.
// But Google-only “one account per user” requires a real identity provider (Firebase / Auth0 / etc.).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 1) Replace with your Firebase project config
// Firebase console → Project settings → Web app
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

const hasFirebaseConfigured =
  !Object.values(firebaseConfig).some(v => String(v || "").includes("REPLACE_ME"));

let app, auth, db;

if (hasFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

const el = (id) => document.getElementById(id);

const ui = {
  userLine: el("userLine"),
  btnSignIn: el("btnSignIn"),
  btnSignOut: el("btnSignOut"),

  btnEnableAudio: el("btnEnableAudio"),
  btnRecord: el("btnRecord"),
  btnPlay: el("btnPlay"),
  btnClear: el("btnClear"),
  metronome: el("metronome"),

  quantize: el("quantize"),
  fx: el("fx"),

  buyQuantize: el("buyQuantize"),
  buyFx: el("buyFx"),

  pads: el("pads"),
  log: el("log"),
};

function log(msg) {
  ui.log.textContent = msg + "\n" + ui.log.textContent.slice(0, 1400);
}

function flashPad(id) {
  const node = document.querySelector(`[data-pad="${id}"]`);
  if (!node) return;
  node.classList.add("active");
  setTimeout(() => node.classList.remove("active"), 90);
}

// ---------------------
// Add-ons (entitlements)
// ---------------------
// Pricing: $5 each (you asked). Store entitlements on the user doc.
const ADDONS = {
  quantize: { key: "quantize", price: 5 },
  fx: { key: "fx", price: 5 },
};

let currentUser = null;
let entitlements = { quantize: false, fx: false };

function applyEntitlements() {
  ui.quantize.disabled = !entitlements.quantize;
  ui.fx.disabled = !entitlements.fx;

  // Keep toggles OFF if locked
  if (!entitlements.quantize) ui.quantize.checked = false;
  if (!entitlements.fx) ui.fx.checked = false;

  ui.buyQuantize.textContent = entitlements.quantize ? "Unlocked" : "Request Unlock ($5)";
  ui.buyFx.textContent = entitlements.fx ? "Unlocked" : "Request Unlock ($5)";
  ui.buyQuantize.disabled = entitlements.quantize || !currentUser;
  ui.buyFx.disabled = entitlements.fx || !currentUser;

  if (!currentUser) {
    ui.buyQuantize.disabled = true;
    ui.buyFx.disabled = true;
  }
}

async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // One doc per uid => one account per Google identity
    await setDoc(ref, {
      email: user.email,
      createdAt: serverTimestamp(),
      addons: { quantize: false, fx: false },
    });
  }
}

async function loadEntitlements(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const addons = data.addons || {};
  entitlements = {
    quantize: !!addons.quantize,
    fx: !!addons.fx,
  };
  applyEntitlements();
}

function copyRequestUnlock(addonKey) {
  const email = currentUser?.email || "";
  const msg =
`Unlock request:
Product: AuraPro Drum Kit
User Email: ${email}
Add-on: ${addonKey}
Price: $5
Note: Please mark my account as unlocked for this add-on.`;

  navigator.clipboard?.writeText(msg).then(() => {
    log(`Copied unlock request for "${addonKey}" to clipboard.`);
  }).catch(() => {
    log(`Could not copy automatically. Message:\n${msg}`);
  });
}

// Manual unlock helper (you can remove this later)
// This is for YOU while testing: click unlock buttons with Shift held to self-unlock.
async function devUnlock(addonKey) {
  const ref = doc(db, "users", currentUser.uid);
  await updateDoc(ref, { [`addons.${addonKey}`]: true });
  await loadEntitlements(currentUser);
  log(`Dev unlocked: ${addonKey}`);
}

// ---------------------
// Auth UI
// ---------------------
async function doSignIn() {
  if (!hasFirebaseConfigured) {
    alert("Firebase is not configured. Add your firebaseConfig in app.js to enable Google sign-in.");
    return;
  }
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

async function doSignOut() {
  if (!auth) return;
  await signOut(auth);
}

ui.btnSignIn.addEventListener("click", doSignIn);
ui.btnSignOut.addEventListener("click", doSignOut);

if (hasFirebaseConfigured) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      ui.userLine.textContent = `Signed in: ${user.email}`;
      ui.btnSignOut.disabled = false;

      // Google-only: by default, provider is Google Sign-in; one Google email => one uid. :contentReference[oaicite:2]{index=2}
      await ensureUserDoc(user);
      await loadEntitlements(user);

      log("Loaded your add-ons from your account.");
    } else {
      ui.userLine.textContent = "Not signed in";
      ui.btnSignOut.disabled = true;
      entitlements = { quantize: false, fx: false };
      applyEntitlements();
      log("Sign in to save add-ons and unlock features.");
    }
  });
} else {
  // No Firebase: still usable locally
  ui.userLine.textContent = "Offline mode (no sign-in configured)";
  ui.btnSignIn.disabled = false;
  ui.btnSignOut.disabled = true;
  applyEntitlements();
  log("Offline mode: drum kit works, but sign-in/add-ons require Firebase config.");
}

// Add-on buttons
ui.buyQuantize.addEventListener("click", async (e) => {
  if (!currentUser) return alert("Sign in with Google to unlock add-ons.");
  if (e.shiftKey) return devUnlock("quantize");
  copyRequestUnlock("quantize");
});
ui.buyFx.addEventListener("click", async (e) => {
  if (!currentUser) return alert("Sign in with Google to unlock add-ons.");
  if (e.shiftKey) return devUnlock("fx");
  copyRequestUnlock("fx");
});

// ---------------------
// Drum Engine (Web Audio synth)
// ---------------------
let AC = null;
let master = null;
let noiseBuf = null;

function ensureAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
  master = AC.createGain();
  master.gain.value = 0.85;
  master.connect(AC.destination);
}

function now() { return AC ? AC.currentTime : 0; }

function envGain(t0, attack, decay, sustain, release, peak = 1) {
  const g = AC.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.linearRampToValueAtTime(peak * sustain, t0 + attack + decay);
  g.gain.linearRampToValueAtTime(0, t0 + attack + decay + release);
  return g;
}

function getNoise() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(AC.sampleRate * 1.0);
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
  noiseBuf = buf;
  return buf;
}

function withFX(node, t) {
  // Studio FX add-on: light compressor + ambience (very subtle)
  if (!ui.fx.checked) return node;

  const comp = AC.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-22, t);
  comp.knee.setValueAtTime(24, t);
  comp.ratio.setValueAtTime(3.2, t);
  comp.attack.setValueAtTime(0.003, t);
  comp.release.setValueAtTime(0.18, t);

  const delay = AC.createDelay(0.25);
  delay.delayTime.setValueAtTime(0.11, t);

  const fb = AC.createGain();
  fb.gain.setValueAtTime(0.18, t);

  delay.connect(fb).connect(delay);

  const wet = AC.createGain();
  wet.gain.setValueAtTime(0.18, t);

  const dry = AC.createGain();
  dry.gain.setValueAtTime(0.90, t);

  // routing
  node.connect(comp);
  comp.connect(dry);

  comp.connect(delay);
  delay.connect(wet);

  const mix = AC.createGain();
  dry.connect(mix);
  wet.connect(mix);
  return mix;
}

function playKick(t) {
  const osc = AC.createOscillator();
  osc.type = "sine";
  const g = envGain(t, 0.001, 0.06, 0.2, 0.18, 1.0);
  const lp = AC.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(120, t + 0.18);
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
  osc.connect(lp).connect(g);
  const out = withFX(g, t);
  out.connect(master);
  osc.start(t);
  osc.stop(t + 0.25);
}

function playSnare(t) {
  const noise = AC.createBufferSource();
  noise.buffer = getNoise();

  const hp = AC.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(900, t);

  const ng = envGain(t, 0.001, 0.03, 0.15, 0.18, 0.9);
  noise.connect(hp).connect(ng);
  const outN = withFX(ng, t);
  outN.connect(master);
  noise.start(t);
  noise.stop(t + 0.25);

  const osc = AC.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(210, t);
  osc.frequency.exponentialRampToValueAtTime(170, t + 0.12);
  const og = envGain(t, 0.001, 0.04, 0.12, 0.16, 0.5);
  osc.connect(og);
  const outO = withFX(og, t);
  outO.connect(master);
  osc.start(t);
  osc.stop(t + 0.22);
}

function playHat(t, open = false) {
  const src = AC.createBufferSource();
  src.buffer = getNoise();

  const bp = AC.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(9000, t);
  bp.Q.value = 6;

  const hp = AC.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(7000, t);

  const dur = open ? 0.6 : 0.12;
  const eg = envGain(t, 0.001, open ? 0.08 : 0.03, 0.2, dur, open ? 0.55 : 0.35);
  src.connect(bp).connect(hp).connect(eg);
  const out = withFX(eg, t);
  out.connect(master);

  src.start(t);
  src.stop(t + dur + 0.12);
}

function playClap(t) {
  const src = AC.createBufferSource();
  src.buffer = getNoise();

  const bp = AC.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2200, t);
  bp.Q.value = 1.4;

  const g = AC.createGain();
  g.gain.setValueAtTime(0, t);

  const hits = [0, 0.018, 0.035];
  hits.forEach((off, i) => {
    const peak = 0.55 - i * 0.12;
    g.gain.setValueAtTime(0, t + off);
    g.gain.linearRampToValueAtTime(peak, t + off + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.08);
  });

  src.connect(bp).connect(g);
  const out = withFX(g, t);
  out.connect(master);

  src.start(t);
  src.stop(t + 0.25);
}

function playTom(t) {
  const osc = AC.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);

  const g = envGain(t, 0.001, 0.05, 0.25, 0.25, 0.8);
  const lp = AC.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1200, t);

  osc.connect(lp).connect(g);
  const out = withFX(g, t);
  out.connect(master);

  osc.start(t);
  osc.stop(t + 0.32);
}

function playCrash(t) {
  const src = AC.createBufferSource();
  src.buffer = getNoise();

  const hp = AC.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(3500, t);

  const g = envGain(t, 0.001, 0.12, 0.35, 1.1, 0.7);
  src.connect(hp).connect(g);
  const out = withFX(g, t);
  out.connect(master);

  src.start(t);
  src.stop(t + 1.4);
}

function playRide(t) {
  const o1 = AC.createOscillator();
  const o2 = AC.createOscillator();
  o1.type = "square"; o2.type = "square";
  o1.frequency.setValueAtTime(520, t);
  o2.frequency.setValueAtTime(528, t);

  const bp = AC.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(5200, t);
  bp.Q.value = 2.5;

  const g = envGain(t, 0.001, 0.08, 0.25, 0.7, 0.25);
  o1.connect(bp); o2.connect(bp);
  bp.connect(g);

  const out = withFX(g, t);
  out.connect(master);

  o1.start(t); o2.start(t);
  o1.stop(t + 0.95); o2.stop(t + 0.95);
}

const sounds = {
  kick: playKick,
  snare: playSnare,
  hihat: (t) => playHat(t, false),
  openhat: (t) => playHat(t, true),
  clap: playClap,
  tom: playTom,
  crash: playCrash,
  ride: playRide,
};

const padDefs = [
  { id: "kick", name: "Kick", key: "A" },
  { id: "snare", name: "Snare", key: "S" },
  { id: "hihat", name: "Closed Hat", key: "D" },
  { id: "openhat", name: "Open Hat", key: "F" },
  { id: "clap", name: "Clap", key: "J" },
  { id: "tom", name: "Tom", key: "K" },
  { id: "crash", name: "Crash", key: "L" },
  { id: "ride", name: "Ride", key: ";" },
];

const keyMap = Object.fromEntries(padDefs.map(p => [p.key.toLowerCase(), p.id]));

// Build pads
for (const p of padDefs) {
  const b = document.createElement("button");
  b.className = "pad";
  b.dataset.pad = p.id;
  b.innerHTML = `<div class="sheen"></div><div class="name">${p.name}</div><div class="key">${p.key}</div>`;
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); trigger(p.id); });
  ui.pads.appendChild(b);
}

// Recording
let recording = false;
let rec = [];
let recStart = null;
let timers = [];
let clickTimer = null;

function stopTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
  if (clickTimer) { clearInterval(clickTimer); clickTimer = null; }
}

function quantizeMs(ms, gridMs = 125) {
  // 120bpm 16th-note grid ~125ms (simple but effective)
  const q = Math.round(ms / gridMs) * gridMs;
  return Math.max(0, q);
}

function trigger(id, fromPlayback = false, atTime = null) {
  ensureAudio();
  if (AC.state === "suspended") AC.resume();

  const t = atTime ?? (now() + 0.0005);
  const fn = sounds[id];
  if (fn) fn(t);
  flashPad(id);

  if (recording && !fromPlayback) {
    const stamp = performance.now();
    if (recStart == null) recStart = stamp;
    rec.push({ id, dt: stamp - recStart });
  }

  if (!fromPlayback) log(`${id.toUpperCase()} @ ${new Date().toLocaleTimeString()}`);
}

ui.btnEnableAudio.addEventListener("click", () => {
  ensureAudio();
  AC.resume();
  log("Audio enabled.");
});

ui.btnRecord.addEventListener("click", () => {
  stopTimers();
  recording = !recording;

  if (recording) {
    rec = [];
    recStart = null;
    ui.btnRecord.textContent = "Stop";
    log("Recording started...");
  } else {
    ui.btnRecord.textContent = "Record";
    log(`Recording stopped. Events: ${rec.length}`);
  }
});

ui.btnPlay.addEventListener("click", () => {
  stopTimers();
  if (!rec.length) return log("Nothing recorded yet.");

  ensureAudio();
  if (AC.state === "suspended") AC.resume();

  const first = rec[0].dt;
  const last = rec[rec.length - 1].dt;
  const duration = last - first;

  // Optional metronome
  if (ui.metronome.checked) {
    const bpm = 120;
    const interval = 60000 / bpm;
    clickTimer = setInterval(() => playHat(now() + 0.0005, false), interval);
    setTimeout(() => { if (clickTimer) { clearInterval(clickTimer); clickTimer = null; } }, duration + 600);
  }

  // Optional quantize (add-on)
  const useQuantize = ui.quantize.checked;
  const events = useQuantize
    ? rec.map(ev => ({ ...ev, dt: quantizeMs(ev.dt - first) + first }))
    : rec;

  log(`Playback started${useQuantize ? " (quantized)" : ""}...`);

  for (const ev of events) {
    const delay = ev.dt - first;
    timers.push(setTimeout(() => trigger(ev.id, true, now() + 0.0005), delay));
  }
});

ui.btnClear.addEventListener("click", () => {
  stopTimers();
  recording = false;
  rec = [];
  recStart = null;
  ui.btnRecord.textContent = "Record";
  log("Cleared recording.");
});

// Keyboard
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (keyMap[k]) {
    e.preventDefault();
    trigger(keyMap[k]);
  }
});

// Initial entitlement apply
applyEntitlements();

