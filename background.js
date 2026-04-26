// Peekaboo — content.js

(function () {
  if (location.protocol === "chrome-extension:") return;

  let widget = null;
  let hideTimer = null;

  async function init() {
    const isBlocked = await checkIfBlocked();
    if (isBlocked) return;
    await renderWidget();
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "PEEKABOO_UPDATE") renderWidget();
    });
  }

  async function checkIfBlocked() {
    const data = await chrome.storage.sync.get("blocklist");
    const blocklist = data.blocklist || [];
    return blocklist.some(term => location.href.toLowerCase().includes(term));
  }

  async function renderWidget() {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get("latestMessage"),
      chrome.storage.sync.get(["mascot", "tone"])
    ]);

    const mascotId = sync.mascot || "cat";
    const tone = sync.tone || "chill";
    const msg = local.latestMessage;

    const displayText = (msg && msg.text)
      ? msg.text
      : "👋 Hi! I'm Peekaboo. I'll check in on your browsing soon!";
    const displayTime = (msg && msg.timestamp)
      ? formatTimeAgo(msg.timestamp)
      : "just installed";

    if (widget) widget.remove();

    widget = document.createElement("div");
    widget.id = "peekaboo-widget";
    widget.setAttribute("data-mascot", mascotId);
    widget.setAttribute("data-tone", tone);

    let svgMarkup = "";
    try {
      const res = await fetch(chrome.runtime.getURL(`mascots/${mascotId}.svg`));
      svgMarkup = await res.text();
    } catch {
      svgMarkup = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="28" fill="#6366f1"/></svg>`;
    }

    widget.innerHTML = `
      <div id="pb-bubble">
        <p id="pb-message">${escapeHtml(displayText)}</p>
        <span id="pb-time">${displayTime}</span>
        <button id="pb-close" aria-label="Close">✕</button>
      </div>
      <div id="pb-mascot-wrap">${svgMarkup}</div>
    `;

    document.body.appendChild(widget);

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hideBubble(), 12000);

    document.getElementById("pb-close").addEventListener("click", (e) => {
      e.stopPropagation();
      hideBubble();
    });

    document.getElementById("pb-mascot-wrap").addEventListener("click", () => {
      const bubble = document.getElementById("pb-bubble");
      if (bubble.classList.contains("pb-hidden")) {
        bubble.classList.remove("pb-hidden");
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => hideBubble(), 12000);
      } else {
        hideBubble();
      }
    });
  }

  function hideBubble() {
    const el = document.getElementById("pb-bubble");
    if (el) el.classList.add("pb-hidden");
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return "just now";
    if (diff === 1) return "1 min ago";
    if (diff < 60) return `${diff} mins ago`;
    return `${Math.floor(diff / 60)}h ago`;
  }

  init();
})();