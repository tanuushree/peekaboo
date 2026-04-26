// peekaboo — popup.js

  const MASCOTS = {
    cat:    "mascots/cat.gif",
    meow:  "mascots/meow.gif",
    witch:  "mascots/witch.gif",
    panda:  "mascots/panda.gif",
  };

const TONES = ["funny", "sarcastic", "motivational", "chill", "honest"];

let currentTone = "chill";
let currentMascot = "cat";

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.sync.get(["tone", "mascot"]);
  currentTone   = stored.tone   || "chill";
  currentMascot = stored.mascot || "cat";

  renderTonePills();
  await loadAndRender();

  // ── Auto-refresh when background writes a new message ─────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.latestMessage) {
      renderMessage(changes.latestMessage.newValue);
    }
  });

  // ── Check-in button ───────────────────────────────────────────────────────
  document.getElementById("refresh-btn").addEventListener("click", async () => {
    const btn = document.getElementById("refresh-btn");
    btn.disabled = true;
    btn.textContent = "Checking in…";

    chrome.runtime.sendMessage({ type: "MANUAL_CHECKIN" }, () => {
      // Response arrives via storage listener above — just re-enable button
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "✦ Check in now";
      }, 3000);
    });
  });
});

// ── Load from storage and render ──────────────────────────────────────────────
async function loadAndRender() {
  const data = await chrome.storage.local.get("latestMessage");
  renderMessage(data.latestMessage || null);
}

function renderMessage(msg) {
  const textEl  = document.getElementById("message-text");
  const timeEl  = document.getElementById("message-time");
  const badgeEl = document.getElementById("tone-badge");
  const mascotEl = document.getElementById("mascot-emoji");

  // Mascot
  mascotEl.textContent = MASCOTS[currentMascot]?.emoji || "🐱";

  if (!msg) {
    textEl.textContent = "No check-in yet — hit the button!";
    textEl.classList.add("empty");
    timeEl.textContent  = "";
    badgeEl.textContent = "";
    return;
  }

  textEl.textContent = msg.text;
  textEl.classList.remove("empty");

  if (msg.timestamp) {
    timeEl.textContent = formatTime(msg.timestamp);
  }

  badgeEl.textContent = msg.tone ? `#${msg.tone}` : "";
}

// ── Tone pills ────────────────────────────────────────────────────────────────
function renderTonePills() {
  const row = document.getElementById("tone-row");
  row.innerHTML = "";

  for (const tone of TONES) {
    const btn = document.createElement("button");
    btn.className = "tone-pill" + (tone === currentTone ? " active" : "");
    btn.textContent = tone;
    btn.addEventListener("click", async () => {
      currentTone = tone;
      await chrome.storage.sync.set({ tone });
      renderTonePills();
    });
    row.appendChild(btn);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

chrome.tabs.query({}, (tabs) => {
  document.getElementById("tab-count").innerHTML =
    `${tabs.length}<br><small>TABS OPEN</small>`;
});