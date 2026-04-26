const MASCOTS = ["cat", "meow", "witch", "panda"];
const MASCOT_GIFS = { cat: "mascots/cat.gif", meow: "mascots/meow.gif", witch: "mascots/witch.gif", panda: "mascots/panda.gif" };

const TONES = ["funny", "sarcastic", "motivational", "chill", "honest"];
const TONE_EXAMPLES = {
  funny: "You've been reading about salaries and doomscrolling Reddit for 40 mins. Classic.",
  sarcastic: "Another 40 minutes on Reddit. Crushing it.",
  motivational: "You've been researching new opportunities — that curiosity is going to pay off.",
  chill: "Looks like you've been exploring some career stuff. No pressure, just noticing.",
  honest: "You've spent most of the last 40 minutes on Reddit and salary comparison sites."
};

const INTERVALS = [
  { label: "30 sec", value: 0.5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 }
];

let state = { mascot: null, tone: null, interval: 30, apiKey: "" };
let currentStep = 1;

document.getElementById("done-btn").addEventListener("click", () => {
  window.close();
});

// ── Step 1: fetch each SVG inline and build grid ──────────────────────────────
async function fetchSVG(id) {
  try {
    const url = chrome.runtime.getURL(`mascots/${id}.svg`);
    console.log("Fetching:", url);

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    return text;
  } catch (err) {
    console.error(`Failed to load ${id}.svg`, err);

    return `<svg viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill="#eef2ff"/>
      <text x="32" y="42" text-anchor="middle" font-size="32">
        ${MASCOT_EMOJIS[id]}
      </text>
    </svg>`;
  }
}

async function buildMascotGrid() {
  const grid = document.getElementById("mascot-grid");
  grid.innerHTML = "";

  for (const id of MASCOTS) {
    const btn = document.createElement("button");
    btn.className = "mascot-btn";

    const img = document.createElement("img");
    img.src = `mascots/${id}.gif`; // 👈 direct path (works in onboarding page)
    img.style.width = "48px";
    img.style.height = "48px";
    img.style.objectFit = "contain";

    const label = document.createElement("span");
    label.textContent = id;

    btn.appendChild(img);
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      document.querySelectorAll(".mascot-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.mascot = id;
      document.getElementById("next-1").disabled = false;
    });

    grid.appendChild(btn);
  }
}

buildMascotGrid();

// ── Step 2: tone grid ─────────────────────────────────────────────────────────
const toneGrid = document.getElementById("tone-grid");
TONES.forEach(t => {
  const btn = document.createElement("button");
  btn.className = "tone-btn";
  btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tone-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.tone = t;
    document.getElementById("tone-preview").textContent = TONE_EXAMPLES[t];
    document.getElementById("next-2").disabled = false;
  });
  toneGrid.appendChild(btn);
});

// ── Step 3: interval ──────────────────────────────────────────────────────────
const intOptions = document.getElementById("interval-options");
INTERVALS.forEach(opt => {
  const btn = document.createElement("button");
  btn.className = "interval-btn" + (opt.value === 30 ? " selected" : "");
  btn.textContent = opt.label;
  btn.addEventListener("click", () => {
    document.querySelectorAll(".interval-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.interval = opt.value;
    updateIntervalPreview();
  });
  intOptions.appendChild(btn);
});

function updateIntervalPreview() {
  const next = new Date(Date.now() + state.interval * 60000);
  const hhmm = next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  document.getElementById("interval-preview").textContent = `Next check-in at ${hhmm}`;
}
updateIntervalPreview();

// ── API key toggle ────────────────────────────────────────────────────────────
document.getElementById("toggle-key").addEventListener("click", () => {
  const inp = document.getElementById("api-key-input");
  inp.type = inp.type === "password" ? "text" : "password";
});

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(n) {
  document.getElementById(`step-${currentStep}`).classList.add("hidden");
  currentStep = n;
  if (n === "done") {
    document.getElementById("progress-bar").classList.add("hidden");
    document.getElementById("step-done").classList.remove("hidden");
    document.getElementById("done-interval").textContent =
      INTERVALS.find(i => i.value === state.interval)?.label || "30 min";
  } else {
    document.getElementById(`step-${n}`).classList.remove("hidden");
    updateProgress(n);
  }
}

function updateProgress(step) {
  [1, 2, 3, 4].forEach(i => {
    document.getElementById(`dot-${i}`).className =
      "step-dot" + (i < step ? " done" : i === step ? " active" : "");
    if (i < 4) {
      document.getElementById(`line-${i}`).className =
        "step-line" + (i < step ? " done" : "");
    }
  });
}

document.getElementById("next-1").addEventListener("click", () => goTo(2));
document.getElementById("back-2").addEventListener("click", () => goTo(1));
document.getElementById("next-2").addEventListener("click", () => goTo(3));
document.getElementById("back-3").addEventListener("click", () => goTo(2));
document.getElementById("next-3").addEventListener("click", () => goTo(4));
document.getElementById("back-4").addEventListener("click", () => goTo(3));

document.getElementById("next-4").addEventListener("click", async () => {
  const key = document.getElementById("api-key-input").value.trim();
  if (!key) { alert("Please enter your groq API key."); return; }
  state.apiKey = key;
  await chrome.storage.sync.set({
    mascot: state.mascot,
    tone: state.tone,
    interval: state.interval,
    apiKey: state.apiKey
  });
  chrome.runtime.sendMessage({ type: "MANUAL_CHECKIN" });
  chrome.runtime.sendMessage({ type: "MANUAL_CHECKIN" });
  goTo("done");
});