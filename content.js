// Peekaboo — content.js
// Renders the floating mascot widget on every page

(function () {
  if (location.protocol === "chrome-extension:") return;

  let widget = null;
  let hideTimer = null;

  async function init() {
    const isBlocked = await checkIfBlocked();
    if (isBlocked) return;
    await renderWidget();
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "VIBECHECK_UPDATE") renderWidget();
    });
  }

  async function checkIfBlocked() {
    const data = await chrome.storage.sync.get("blocklist");
    const blocklist = data.blocklist || [];
    const url = location.href.toLowerCase();
    return blocklist.some(term => url.includes(term));
  }

  async function renderWidget() {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get("latestMessage"),
      chrome.storage.sync.get(["mascot", "tone"])
    ]);

    const msg = local.latestMessage;
    const mascotId = sync.mascot || "cat";
    const tone = sync.tone || "chill";

    if (!msg || !msg.text) return;

    if (widget) widget.remove();

    widget = document.createElement("div");
    widget.id = "vibecheck-widget";
    widget.setAttribute("data-mascot", mascotId);
    widget.setAttribute("data-tone", tone);

    const timeAgo = formatTimeAgo(msg.timestamp);

    // Fetch SVG inline to avoid CSP img-src restrictions
    let svgMarkup = "";
    try {
      const svgSrc = chrome.runtime.getURL(`mascots/${mascotId}.svg`);
      const res = await fetch(svgSrc);
      svgMarkup = await res.text();
    } catch (e) {
      svgMarkup = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="28" fill="#6366f1"/></svg>`;
    }

    widget.innerHTML = `
      <div id="vc-bubble">
        <p id="vc-message">${escapeHtml(msg.text)}</p>
        <span id="vc-time">${timeAgo}</span>
        <button id="vc-close" aria-label="Close">✕</button>
      </div>
      <div id="vc-mascot-wrap">
        ${svgMarkup}
      </div>
    `;

    document.body.appendChild(widget);

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hideBubble(), 12000);

    document.getElementById("vc-close").addEventListener("click", (e) => {
      e.stopPropagation();
      hideBubble();
    });

    document.getElementById("vc-mascot-wrap").addEventListener("click", () => {
      const bubble = document.getElementById("vc-bubble");
      if (bubble.classList.contains("vc-hidden")) {
        bubble.classList.remove("vc-hidden");
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => hideBubble(), 12000);
      } else {
        hideBubble();
      }
    });
  }

  function hideBubble() {
    const bubble = document.getElementById("vc-bubble");
    if (bubble) bubble.classList.add("vc-hidden");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTimeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 60000);
    if (diff < 1) return "just now";
    if (diff === 1) return "1 min ago";
    if (diff < 60) return `${diff} mins ago`;
    return `${Math.floor(diff / 60)}h ago`;
  }

  init();
})();