// peekaboo — content.js

(function () {
  if (document.getElementById("peekaboo-host")) return;

  const MASCOTS = {
    cat:    "🐱",
    ghost:  "👻",
    robot:  "🤖",
    alien:  "👽",
    wizard: "🧙",
  };

  // ── Host element + Shadow DOM ───────────────────────────────────────────────
  const host = document.createElement("div");
  host.id = "peekaboo-host";

  // These styles are on the HOST element itself, outside shadow DOM,
  // so they control its position on the page
  host.style.cssText = `
    all: initial;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  `;

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { display: block; }

      #bubble {
        background: #fff;
        border: 1.5px solid #e5e7eb;
        border-radius: 14px 14px 4px 14px;
        padding: 10px 28px 10px 14px;
        max-width: 220px;
        font-size: 13px;
        line-height: 1.5;
        color: #111;
        box-shadow: 0 4px 20px rgba(0,0,0,0.13);
        pointer-events: auto;
        position: relative;
        display: none;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      #bubble.visible {
        display: block;
        opacity: 1;
        transform: translateY(0);
      }

      #dismiss {
        position: absolute;
        top: 6px;
        right: 8px;
        font-size: 11px;
        color: #9ca3af;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
        line-height: 1;
        font-family: inherit;
      }
      #dismiss:hover { color: #374151; }

      #avatar {
        font-size: 36px;
        line-height: 1;
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        display: block;
        text-align: right;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        transition: transform 0.15s ease;
      }
      #avatar:hover { transform: scale(1.12); }
      #avatar:active { transform: scale(0.95); }
    </style>

    <div id="bubble">
      <button id="dismiss">✕</button>
      <span id="msg"></span>
    </div>
    <div id="avatar">🐱</div>
  `;

  // Attach to <html> so it's always present regardless of body state
  document.documentElement.appendChild(host);

  const bubble  = shadow.getElementById("bubble");
  const msgEl   = shadow.getElementById("msg");
  const avatar  = shadow.getElementById("avatar");
  const dismiss = shadow.getElementById("dismiss");

  let hideTimer = null;

  // ── Show bubble ─────────────────────────────────────────────────────────────
  function showBubble(text) {
    msgEl.textContent = text;
    bubble.style.display = "block";
    // Force reflow so transition fires
    bubble.getBoundingClientRect();
    bubble.classList.add("visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBubble, 10_000);
  }

  function hideBubble() {
    bubble.classList.remove("visible");
    clearTimeout(hideTimer);
    setTimeout(() => { bubble.style.display = "none"; }, 200);
  }

  // ── Avatar: toggle bubble ───────────────────────────────────────────────────
  avatar.addEventListener("click", () => {
    if (bubble.classList.contains("visible")) {
      hideBubble();
      return;
    }
    chrome.storage.local.get("latestMessage", (data) => {
      showBubble(data.latestMessage?.text || "No check-in yet — hit Check In in the popup!");
    });
  });

  dismiss.addEventListener("click", (e) => {
    e.stopPropagation();
    hideBubble();
  });

  // ── Sync mascot ─────────────────────────────────────────────────────────────
  function syncMascot() {
    chrome.storage.sync.get("mascot", (data) => {
      avatar.textContent = MASCOTS[data.mascot] || "🐱";
    });
  }
  syncMascot();

  // ── Background message ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "PEEKABOO_UPDATE") return;
    chrome.storage.local.get("latestMessage", (data) => {
      const latest = data.latestMessage;
      if (!latest?.text) return;
      syncMascot();
      showBubble(latest.text);
    });
  });

  // ── Storage watcher (belt-and-suspenders) ───────────────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.latestMessage) {
      syncMascot();
      showBubble(changes.latestMessage.newValue?.text || "");
    }
  });

})();