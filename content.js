// peekaboo — content.js

(function () {
  if (document.getElementById("peekaboo-host")) return;

  const MASCOTS = {
    cat: "mascots/cat.gif",
    meow: "mascots/meow.gif",
    witch: "mascots/witch.gif",
    panda: "mascots/panda.gif",
  };

  // ── Host element + Shadow DOM ───────────────────────────────────────────────
  const host = document.createElement("div");
  host.id = "peekaboo-host";

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
        width: 100px;
        height: 100px;
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        text-align: right;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        transition: transform 0.15s ease, opacity 0.3s ease;
      }
      #avatar:hover { transform: scale(1.12); }
      #avatar:active { transform: scale(0.95); }

      #avatar.dismissed {
        opacity: 0;
        transform: scale(0.85);
        pointer-events: none;
      }
    </style>

    <div id="bubble">
      <button id="dismiss">✕</button>
      <span id="msg"></span>
    </div>
    <div id="avatar">🐱</div>
  `;

  document.documentElement.appendChild(host);

  const bubble  = shadow.getElementById("bubble");
  const msgEl   = shadow.getElementById("msg");
  const avatar  = shadow.getElementById("avatar");
  const dismiss = shadow.getElementById("dismiss");

  let hideTimer   = null;
  let cycleTimer  = null;
  let isRunning   = false;
  let isDismissed = false;
  let bubbleOpen  = false;

  // ── Visibility helpers ──────────────────────────────────────────────────────

  function showMascot() {
    host.style.display = "flex";
  }

  function hideMascot() {
    host.style.display = "none";
  }

  // Fires on mousemove when dismissed — restores mascot when cursor
  // moves into the bottom-right 120x120px corner of the viewport.
  function onCornerHover(e) {
    const fromRight  = window.innerWidth  - e.clientX;
    const fromBottom = window.innerHeight - e.clientY;
    if (fromRight <= 120 && fromBottom <= 120) {
      console.log("[Peekaboo] corner re-entry detected, restoring mascot");
      restoreAvatar();
    }
  }

  function dismissAvatar() {
    console.log("[Peekaboo] dismissAvatar — hiding mascot, watching for corner re-entry");
    isDismissed = true;
    hideBubble();
    avatar.classList.add("dismissed");
    // Use document-level mousemove instead of a hover zone element —
    // avoids the instant mouseenter race condition on the same spot.
    document.addEventListener("mousemove", onCornerHover);
  }

  function restoreAvatar() {
    console.log("[Peekaboo] restoreAvatar — mascot visible again");
    isDismissed = false;
    avatar.classList.remove("dismissed");
    document.removeEventListener("mousemove", onCornerHover);
  }

  // ── Bubble helpers ──────────────────────────────────────────────────────────

  function showBubble(text) {
    console.log("[Peekaboo] showBubble — isDismissed:", isDismissed, "| text:", text);
    if (isDismissed) {
      console.log("[Peekaboo] → skipped, mascot is dismissed");
      return;
    }
    bubbleOpen = true;
    msgEl.textContent = text;
    bubble.style.display = "block";
    bubble.getBoundingClientRect();
    bubble.classList.add("visible");
    console.log("[Peekaboo] bubble shown, bubbleOpen:", bubbleOpen);
  }

  function hideBubble() {
    console.log("[Peekaboo] hideBubble — bubbleOpen was:", bubbleOpen);
    bubbleOpen = false;
    bubble.classList.remove("visible");
    clearTimeout(hideTimer);
    setTimeout(() => { bubble.style.display = "none"; }, 200);
  }

  // ── Avatar interactions ─────────────────────────────────────────────────────

  // Click state machine:
  //   bubble open  → close bubble
  //   bubble closed → dismiss mascot
  avatar.addEventListener("click", () => {
    console.log("[Peekaboo] avatar clicked — bubbleOpen:", bubbleOpen, "| isDismissed:", isDismissed);
    if (bubbleOpen) {
      console.log("[Peekaboo] → closing bubble");
      hideBubble();
      return;
    }
    console.log("[Peekaboo] → dismissing mascot");
    dismissAvatar();
  });

  dismiss.addEventListener("click", (e) => {
    e.stopPropagation();
    hideBubble();
  });

  // ── Cycle ───────────────────────────────────────────────────────────────────

  function startCycle() {
    clearInterval(cycleTimer);
    runCycle();
    cycleTimer = setInterval(runCycle, 5 * 60 * 1000);
  }

  function runCycle() {
    if (isRunning) return;
    isRunning = true;

    restoreAvatar();
    showMascot();

    chrome.storage.local.get("latestMessage", (data) => {
      const text = data.latestMessage?.text || "Just lurking 👀";
      showBubble(text);

      setTimeout(() => {
        hideBubble();
        setTimeout(() => {
          hideMascot();
          isRunning = false;
        }, 60 * 1000);
      }, 10 * 1000);
    });
  }

  // ── Mascot sync ─────────────────────────────────────────────────────────────

  function syncMascot() {
    chrome.storage.sync.get("mascot", (data) => {
      const key  = data.mascot || "cat";
      const path = MASCOTS[key] || MASCOTS.cat;
      const url  = chrome.runtime.getURL(path);
      avatar.innerHTML = `
        <img src="${url}" style="width:100px; height:100px; object-fit:contain;" />
      `;
    });
  }
  syncMascot();

  // ── Message listeners ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "PEEKABOO_UPDATE") return;
    // onChanged handles the bubble — just sync the gif here
    syncMascot();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.latestMessage) {
      const text = changes.latestMessage.newValue?.text || "";
      console.log("[Peekaboo] storage changed — text:", text, "| isDismissed:", isDismissed);
      syncMascot();
      if (!isDismissed) showBubble(text);
    }
  });

  hideMascot();
  startCycle();

})();