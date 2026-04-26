const MASCOT_EMOJIS = { cat: "🐱", robot: "🤖", fox: "🦊", panda: "🐼", frog: "🐸" };
const TONES = ["funny", "sarcastic", "motivational", "chill", "honest"];

async function load() {
    const [local, sync] = await Promise.all([
        chrome.storage.local.get("latestMessage"),
        chrome.storage.sync.get(["mascot", "tone"])
    ]);

    const mascot = sync.mascot || "cat";
    const tone = sync.tone || "chill";

    document.getElementById("mascot-emoji").textContent =
        MASCOT_EMOJIS[mascot] || "🐱";

    const msg = local.latestMessage;

    if (msg && msg.text) {
        document.getElementById("message-text").textContent = msg.text;
        document.getElementById("message-text").classList.remove("empty");

        const diff = Math.floor((Date.now() - msg.timestamp) / 60000);
        const timeStr =
            diff < 1 ? "just now" :
                diff === 1 ? "1 min ago" :
                    `${diff} mins ago`;

        document.getElementById("message-time").textContent = timeStr;
        document.getElementById("tone-badge").textContent = msg.tone || tone;
    } else {
        document.getElementById("message-text").textContent =
            "No check-in yet — hang tight!";
        document.getElementById("message-text").classList.add("empty");
    }

    renderTonePills(tone);
}

function renderTonePills(activeTone) {
    const row = document.getElementById("tone-row");
    row.innerHTML = "";

    TONES.forEach(t => {
        const btn = document.createElement("button");
        btn.className = "tone-pill" + (t === activeTone ? " active" : "");
        btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);

        btn.addEventListener("click", async () => {
            await chrome.storage.sync.set({ tone: t });

            document.querySelectorAll(".tone-pill")
                .forEach(b => b.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById("tone-badge").textContent = t;
        });

        row.appendChild(btn);
    });
}

document.getElementById("refresh-btn").addEventListener("click", async () => {
    const btn = document.getElementById("refresh-btn");

    btn.disabled = true;
    btn.textContent = "Checking in…";

    try {
        await chrome.runtime.sendMessage({ type: "MANUAL_CHECKIN" });
    } catch (err) {
        console.warn("Background not ready yet:", err);
    }

    await load();

    btn.disabled = false;
    btn.textContent = "✦ Check in now";
});

load();