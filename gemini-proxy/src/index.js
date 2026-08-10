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

// Real, known facts about the school - given to the model so it can accurately answer
// questions about the site/courses instead of guessing. Keep this in sync with index.html
// if the page content changes (programs, phone, hours, stats).
var SCHOOL_FACTS = "Known facts about Ataşehir American VIP (use these, never invent " +
  "different ones): Phone/WhatsApp (0216) 519 95 95. Location: Ataşehir, Istanbul (exact " +
  "street address not published yet - if asked, say to call/WhatsApp for the exact " +
  "address). Hours: weekdays 09:00-20:00. Programs offered: Yaz Okulu (Summer School), " +
  "Junior İngilizce (kids/teens), Genel İngilizce (General English, beginner to advanced), " +
  "Sınav Hazırlık (exam prep: IELTS, TOEFL, YDS), Kurumsal İngilizce (corporate English), " +
  "and a free level-placement test (Seviye Tespit Sınavı) that comes with an extra 10% " +
  "discount. Track record: 5100+ happy students, 20+ classrooms, 37+ awards won, 4900+ " +
  "certificates issued. Classes are in-person (face to face), taught by an experienced " +
  "teacher team.";

// The frontend has a Turkish/English toggle the visitor picks before talking, and passes
// it through as `lang`. Reply language now follows that toggle (previously this always
// forced English replies regardless of what the visitor chose or spoke).
function buildSystemPrompt(lang) {
  var replyLanguageLine = lang === "tr"
    ? "ALWAYS reply only in Turkish (Türkçe), in 2-4 short, natural sentences."
    : "ALWAYS reply only in English, in 2-4 short, natural sentences.";
  return "You are the friendly AI assistant embedded on the website of 'Ataşehir " +
    "American VIP', an English language school in Ataşehir, Istanbul - you're the " +
    "central, most prominent feature of the site, not a hidden extra. " +
    replyLanguageLine + " Sound like chatting with a warm, helpful person - not a formal " +
    "script. Visitors can ask you TWO kinds of things and both are exactly what you're " +
    "for: (1) real questions about the school - programs, hours, phone, discount, track " +
    "record - answer those accurately using the facts below, and suggest calling " +
    "(0216) 519 95 95 or WhatsApp for anything not covered here (never invent prices, " +
    "exact addresses or guarantees you don't know); (2) casual open-ended conversation " +
    "about anything at all, which also doubles as real English/Turkish practice for them. " +
    "Move naturally between the two depending on what they ask - don't force a sales pitch " +
    "into casual chat, and don't dodge a real question about the school. STRICT RULE: the " +
    "facts below are the ONLY facts you know about the school - when asked something " +
    "covered by them (hours, programs, phone, discount, stats), state that exact fact " +
    "directly, don't deflect it to a phone call. Never add details not listed here - no " +
    "online classes, no weekends, no speaking clubs, no class sizes/prices, nothing " +
    "invented, even if it sounds plausible. Only suggest calling/WhatsApp for things " +
    "genuinely NOT listed below (like the exact street address or a specific price).\n\n" +
    SCHOOL_FACTS;
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
