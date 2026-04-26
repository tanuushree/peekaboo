// Vibecheck — background.js
// Service worker: alarms, history fetch, Gemini API call, storage write

const ALARM_NAME = "vibecheck-interval";
const DEFAULT_INTERVAL = 30; // minutes

// ── Tone → system prompt mapping ──────────────────────────────────────────────
const TONE_PROMPTS = {
  funny: `You are a witty, slightly chaotic browser companion. Comment on the user's browsing activity with dry humour and playful observations. Keep it light, punchy, and under 2 sentences. Never be mean.`,
  sarcastic: `You are a deadpan, mildly sarcastic browser companion. Observe the user's browsing with subtle irony. Short, dry, understated. Under 2 sentences. Never cruel.`,
  motivational: `You are an enthusiastic, genuine motivational companion. Find something positive or growth-oriented in the user's browsing and cheer them on. Warm, energetic, sincere. Under 2 sentences.`,
  chill: `You are a laid-back, non-judgmental browser companion. Observe the user's browsing casually with zero pressure. Relaxed vibes only. Under 2 sentences.`,
  honest: `You are a straightforward, neutral browser companion. State plainly what the user has been doing online without spin or embellishment. Factual and brief. Under 2 sentences.`
};

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "onboarding.html" });
  }
  await setupAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarm();
});

// Re-setup alarm if interval setting changes
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.interval) {
    await setupAlarm();
  }
});

// ── Alarm setup ───────────────────────────────────────────────────────────────
async function setupAlarm() {
  const data = await chrome.storage.sync.get("interval");
  const interval = data.interval || DEFAULT_INTERVAL;
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: interval });
}

// ── Main alarm handler ────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await runCheckin();
});

// Expose manual trigger for debugging / onboarding preview
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "MANUAL_CHECKIN") {
    (async () => {
      try {
        await runCheckin();
        sendResponse({ ok: true });
      } catch (err) {
        console.error("Checkin failed:", err);
        sendResponse({ ok: false });
      }
    })();

    return true; // VERY important
  }
});

// ── Core check-in logic ───────────────────────────────────────────────────────
async function runCheckin() {
  const settings = await chrome.storage.sync.get(["apiKey", "tone", "mascot", "blocklist"]);

  if (!settings.apiKey) {
    console.warn("Vibecheck: no API key set — skipping check-in.");
    return;
  }

  const tone = settings.tone || "chill";
  const blocklist = settings.blocklist || DEFAULT_BLOCKLIST;

  const [tabs, history] = await Promise.all([
    getOpenTabs(blocklist),
    getRecentHistory(blocklist)
  ]);

  if (tabs.length === 0 && history.length === 0) {
    await saveMessage("Nothing to report — you've been quiet online.", tone);
    return;
  }

  const message = await callGemini(settings.apiKey, tone, tabs, history);
  await saveMessage(message, tone);

  // Ping all active tabs to refresh the mascot
  const allTabs = await chrome.tabs.query({});

  for (const tab of allTabs) {
    if (!tab.id || !tab.url) continue;

    // Skip restricted pages
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) continue;

    try {
      await chrome.tabs.sendMessage(tab.id, { type: "PEEKABOO_UPDATE" });
    } catch (err) {
      // This just means content script isn't injected — safe to ignore
    }
  }
}

// ── Fetch open tab titles/URLs ────────────────────────────────────────────────
async function getOpenTabs(blocklist) {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter(t => t.url && !isBlocked(t.url, blocklist))
    .map(t => ({ title: t.title || "", url: stripSensitive(t.url) }))
    .slice(0, 20);
}

// ── Fetch recent history (last 40 mins) ───────────────────────────────────────
async function getRecentHistory(blocklist) {
  const since = Date.now() - 40 * 60 * 1000;
  const items = await chrome.history.search({ text: "", startTime: since, maxResults: 30 });
  return items
    .filter(i => i.url && !isBlocked(i.url, blocklist))
    .map(i => ({ title: i.title || "", url: stripSensitive(i.url) }))
    .slice(0, 20);
}

// ── Block/strip helpers ───────────────────────────────────────────────────────
const DEFAULT_BLOCKLIST = [
  "bank", "banking", "chase.com", "wellsfargo", "bankofamerica",
  "healthcare", "health.google", "mychart",
  "docs.google.com", "sheets.google.com",
  "mail.google.com", "outlook.live.com"
];

function isBlocked(url, blocklist) {
  const lower = url.toLowerCase();
  return blocklist.some(term => lower.includes(term));
}

function stripSensitive(url) {
  try {
    const u = new URL(url);
    // Keep only origin + pathname, drop query params and hash
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

// ── Gemini API call ───────────────────────────────────────────────────────────
async function callGemini(apiKey, tone, tabs, history) {
  const systemInstruction = TONE_PROMPTS[tone] || TONE_PROMPTS.chill;
  const userContent = buildPrompt(tabs, history);

  const endpoint = "https://api.groq.com/openai/v1/chat/completions";

  const body = {
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userContent }
    ],
    temperature: 0.9,
    max_tokens: 100
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Groq API error:", err);

      if (res.status === 429) {
        return "Too many check-ins right now — give it a second.";
      }

      return "Couldn't reach the AI right now.";
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;

    return text?.trim() || "No message generated.";
  } catch (err) {
    console.error("Groq fetch error:", err);
    return "Network error — check your connection.";
  }
}

function buildPrompt(tabs, history) {
  const tabLines = tabs.map(t => `[TAB] ${t.title} — ${t.url}`).join("\n");
  const histLines = history.map(h => `[HISTORY] ${h.title} — ${h.url}`).join("\n");
  return `Here is what the user has open and recently visited in their browser:\n\n${tabLines}\n${histLines}\n\nGenerate a single short message (under 2 sentences) based on this activity.`;
}

// ── Save latest message ───────────────────────────────────────────────────────
async function saveMessage(text, tone) {
  await chrome.storage.local.set({
    latestMessage: {
      text,
      tone,
      timestamp: Date.now()
    }
  });
}