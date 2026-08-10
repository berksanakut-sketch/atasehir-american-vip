// Ataşehir American VIP - Gemini proxy
//
// The site's browser JS used to call Google's Gemini API directly with the API key
// embedded in index.html (visible in page source AND in the public GitHub repo). This
// Worker sits in between: the site calls this Worker instead, and only this Worker
// (running server-side on Cloudflare, never shipped to the browser) holds the real key
// as a secret. The frontend sends just { text }, this Worker builds the actual Gemini
// request (model + system prompt + key) and returns the reply text.
//
// Deployed with: wrangler deploy
// Key stored with: wrangler secret put GEMINI_API_KEY

const ALLOWED_ORIGIN = "https://berksanakut-sketch.github.io";
const GEMINI_MODEL = "gemini-flash-latest";

// The frontend has a Turkish/English toggle the visitor picks before talking, and passes
// it through as `lang`. Reply language now follows that toggle (previously this always
// forced English replies regardless of what the visitor chose or spoke).
function buildSystemPrompt(lang) {
  var replyLanguageLine = lang === "tr"
    ? "ALWAYS reply only in Turkish (Türkçe), in 2-4 short, natural sentences."
    : "ALWAYS reply only in English, in 2-4 short, natural sentences.";
  return "You are a warm, casual, friendly conversation buddy on the website of " +
    "'Ataşehir American VIP', an English language school in Ataşehir, Istanbul. " +
    replyLanguageLine + " Sound like chatting with a friendly native speaker - not a " +
    "formal script. You can talk about ANYTHING the visitor brings up (daily life, " +
    "opinions, jokes, random questions), the same way a real conversation partner would, " +
    "since that's genuinely useful practice for them. Only steer toward the school " +
    "(call (0216) 519 95 95 or WhatsApp) when the visitor actually asks about " +
    "courses/enrollment - don't force it into unrelated chat. Never invent prices, " +
    "addresses or guarantees you don't know.";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    let userText, lang;
    try {
      const body = await request.json();
      userText = body && body.text;
      lang = body && body.lang === "tr" ? "tr" : "en";
    } catch (e) {
      return new Response("Bad request", { status: 400, headers: corsHeaders() });
    }
    if (!userText || typeof userText !== "string") {
      return new Response("Missing 'text'", { status: 400, headers: corsHeaders() });
    }

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL +
      ":generateContent?key=" + env.GEMINI_API_KEY;

    const geminiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userText }] }],
        systemInstruction: { parts: [{ text: buildSystemPrompt(lang) }] },
      }),
    });

    const data = await geminiResp.json();
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    return new Response(JSON.stringify({ text: text || null }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  },
};
