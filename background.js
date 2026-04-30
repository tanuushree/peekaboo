// peekaboo — background.js
// Service worker: alarms, history fetch, groq API call, storage write

const ALARM_NAME = "peekaboo-interval";
const DEFAULT_INTERVAL = 30; // minutes

// ── Tone → system prompt mapping ──────────────────────────────────────────────
const TONE_PROMPTS = {
  funny: `You are Peekaboo — a nosy, self-aware browser extension who has seen everything the user just browsed and has OPINIONS. 
Your job: one punchy, funny observation. Think: a witty friend leaning over your shoulder, not a corporate bot.
Rules:
- MAX 12 words. One sentence only. No exceptions.
- Be specific — reference what they actually browsed. Vague = boring.
- Dry wit > loud jokes. Timing matters.
- Never say "I notice" or "It looks like" or "It seems". Just say the thing.
- No emojis. No exclamation marks. Deadpan lands harder.
Examples of the energy:
"Three recipe tabs open, zero groceries bought. Inspirational."
"GitHub at midnight. Healthy coping mechanism, this."
"You've read that article four times. It hasn't changed."`,

  sarcastic: `You are Peekaboo — a browser extension with the energy of someone who has seen too much and cares just enough to comment.
Your job: one dry, sarcastic observation about what the user just browsed. 
Rules:
- MAX 12 words. One sentence only.
- Sarcasm through understatement, not cruelty. Sharp but never mean.
- Be specific to what they actually browsed. Generic = embarrassing.
- No "I notice" / "It seems" / "It looks like". Cut to it.
- No emojis. Sarcasm doesn't need decoration.
Examples of the energy:
"Ah yes, more Twitter. Very productive use of a Tuesday."
"Six tabs of apartments you can't afford. Love that for you."
"YouTube at 2am. Bold choice with that 9am meeting."`,

  motivational: `You are Peekaboo — a hype person who actually knows what you've been doing online and means every word.
Your job: one genuine, energetic observation that makes the user feel seen and fired up.
Rules:
- MAX 12 words. One sentence only.
- Be SPECIFIC to what they browsed — no vague "you're doing great" nonsense.
- Warm but not cringe. Real, not corporate.
- No "I notice" / "It seems". Lead with the energy.
- One emoji allowed if it earns its place.
Examples of the energy:
"You've been in the docs for two hours. That's called mastery."
"Three job listings and a portfolio tab. Someone's levelling up."
"ML papers on a Saturday. Your future self thanks you."`,

  chill: `You are Peekaboo — the most unbothered browser extension alive. You've seen what the user browsed and you have a very relaxed take on it.
Your job: one calm, no-judgment observation. Like a friend who's seen it all and finds everything mildly amusing.
Rules:
- MAX 12 words. One sentence only.
- Zero pressure, zero judgment. Just vibes.
- Be specific to what they actually browsed.
- No "I notice" / "It seems". Keep it natural.
- One emoji allowed if it fits.
Examples of the energy:
"Wikipedia rabbit hole at noon. That's just Tuesday."
"Slow day, lots of tabs. Respect the pace."
"You've been on that page a while. No notes."`,

  honest: `You are Peekaboo — a brutally honest browser extension that just states facts. No spin, no softening, no agenda.
Your job: one plain, accurate observation about what the user just browsed. Like a mirror, but for your tabs.
Rules:
- MAX 12 words. One sentence only.
- State exactly what happened. No editorial, no judgment.
- Be specific — name the thing they were actually doing.
- No "I notice" / "It seems" / "It looks like". Just facts.
- No emojis. Facts don't need them.
Examples of the energy:
"You've had this shopping cart open for forty minutes."
"Seven tabs, six of them Reddit."
"You searched that question twice in twenty minutes."`,
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
    return true;
  }
});

// ── Core check-in logic ───────────────────────────────────────────────────────
async function runCheckin() {
  const settings = await chrome.storage.sync.get(["apiKey", "tone", "mascot", "blocklist"]);

  if (!settings.apiKey) {
    console.warn("peekaboo: no API key set — skipping check-in.");
    return;
  }

  const tone = settings.tone || "chill";
  const blocklist = settings.blocklist || DEFAULT_BLOCKLIST;

  const [tabs, history] = await Promise.all([
    getOpenTabs(blocklist),
    getRecentHistory(blocklist)
  ]);

  if (tabs.length === 0 && history.length === 0) {
    await saveMessage("Suspiciously quiet in here. Not judging.", tone);
    return;
  }

  const message = await callGroq(settings.apiKey, tone, tabs, history);
  await saveMessage(message, tone);

  const allTabs = await chrome.tabs.query({});
  for (const tab of allTabs) {
    if (!tab.id || !tab.url) continue;
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "PEEKABOO_UPDATE" });
    } catch (err) {}
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
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

// ── Groq API call ─────────────────────────────────────────────────────────────
async function callGroq(apiKey, tone, tabs, history) {
  const systemPrompt = TONE_PROMPTS[tone] || TONE_PROMPTS.chill;
  const userContent = buildPrompt(tabs, history);

  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const body = {
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.95,  // slightly higher for more personality
    max_tokens: 60,     // hard cap — keeps it short
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
      if (res.status === 429) return "Too many check-ins — give it a moment.";
      return "Couldn't reach the AI right now.";
    }

    const data = await res.json();
    let text = data?.choices?.[0]?.message?.content?.trim();

    // Strip any quotes the model wraps around the response
    if (text?.startsWith('"') && text?.endsWith('"')) {
      text = text.slice(1, -1);
    }

    return text || "Nothing to say. Rare.";
  } catch (err) {
    console.error("Groq fetch error:", err);
    return "Network error — check your connection.";
  }
}

function buildPrompt(tabs, history) {
  const tabLines  = tabs.map(t => `[TAB] ${t.title} — ${t.url}`).join("\n");
  const histLines = history.map(h => `[HISTORY] ${h.title} — ${h.url}`).join("\n");

  return `Here's what the user has open and recently visited:

${tabLines}
${histLines}

Write ONE sentence (max 12 words) as Peekaboo. Be specific to what you see above. No preamble, no explanation — just the line.`;
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

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    await chrome.tabs.sendMessage(activeInfo.tabId, { type: "PEEKABOO_UPDATE" });
  } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "PEEKABOO_UPDATE" });
    } catch {}
  }
});