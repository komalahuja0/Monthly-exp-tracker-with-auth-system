const Expense = require("../models/Expense");

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// If the first model is overloaded, the next one is tried.
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const RETRY_STATUSES = [429, 500, 503];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Calls Gemini. Pass opts.schema to force a structured JSON answer.
const callClaude = async (systemPrompt, userMessage, opts = {}) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set on the server");
  }

  const generationConfig = { maxOutputTokens: 2048, temperature: 0.4 };
  if (opts.schema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = opts.schema;
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig,
  });

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body,
      });

      if (response.ok) {
        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        // Skip the model's internal "thought" parts; keep only the real answer.
        return parts
          .filter((p) => !p.thought)
          .map((p) => p.text || "")
          .join("");
      }

      const errText = await response.text();
      if (!RETRY_STATUSES.includes(response.status)) {
        throw new Error(`AI API error: ${errText}`);
      }
      console.log(`AI model ${model} busy (status ${response.status}), attempt ${attempt + 1}`);
      await sleep(1000 * (attempt + 1));
    }
  }

  throw new Error("The AI service is busy right now. Please try again in a minute.");
};

// Parse a natural language sentence like "spent 200 on coffee and 50 on bus"
// into structured { name, amount } entries
const parseEntry = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please describe what you spent.",
      });
    }

    const systemPrompt = `You convert a casual sentence about spending money into a strict JSON array.
Each item must be: {"name": "short expense label", "amount": number}.
Rules:
- Extract every distinct expense mentioned, even if multiple are in one sentence.
- "amount" must be a plain number (no currency symbols, no commas).
- If no clear amount is mentioned for an item, skip that item.
- Respond with ONLY the JSON array. No prose, no markdown fences, no explanation.
- If nothing parseable is found, respond with [].`;

    const raw = await callClaude(systemPrompt, text);
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = [];
    }

    if (!Array.isArray(parsed)) parsed = [];

    const entries = parsed
      .filter((e) => e && e.name && typeof e.amount === "number" && e.amount > 0)
      .map((e) => ({ name: String(e.name).trim(), amount: e.amount }));

    res.status(200).json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------- spending summary ----------

const SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: { summary: { type: "STRING" } },
  required: ["summary"],
};

// Reject anything that is not a clean, finished paragraph.
const isGoodSummary = (text) => {
  const t = (text || "").trim();
  if (t.length < 60 || t.length > 700) return false;
  if (/[*#`]|\?|\n\n/.test(t)) return false;
  if (!/[.!]$/.test(t)) return false;
  return (t.match(/[.!]/g) || []).length >= 2;
};

const extractSummary = (raw) => {
  try {
    return String(JSON.parse(raw).summary || "").trim();
  } catch {
    return String(raw || "").trim();
  }
};

// Always-available summary built from the numbers (used if the AI is down or answers badly).
const buildFallbackSummary = (f) => {
  const money = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const first =
    f.remaining >= 0
      ? `You’ve used ${f.percentUsed}% of your ${money(f.totalBudget)} budget, with ${money(f.remaining)} still available.`
      : `You’re ${money(Math.abs(f.remaining))} over your ${money(f.totalBudget)} budget (${f.percentUsed}% used).`;

  const second = `Your biggest expense is “${f.biggest.name}” at ${money(f.biggest.amount)}, which is ${f.biggestShare}% of what you’ve spent.`;

  let third;
  if (f.remaining < 0) {
    third = "Try to hold off on non-essential spending for the rest of the month to bring things back under control.";
  } else if (f.perDay) {
    third = `To stay on track, keep your spending under ${money(f.perDay)} a day for the next ${f.daysLeft} ${f.daysLeft === 1 ? "day" : "days"}.`;
  } else {
    third = `That leaves ${money(f.remaining)} unspent, which you can carry over into next month.`;
  }

  return `${first} ${second} ${third}`;
};

// Generate spending insights for a given month
const getInsights = async (req, res) => {
  try {
    const { month, year } = req.params;

    const expense = await Expense.findOne({
      userId: req.user.userId,
      month,
      year,
    });

    if (!expense || !expense.entries || expense.entries.length === 0) {
      return res.status(200).json({
        success: true,
        source: "calculated",
        insight: "Add a few expenses first and I'll find patterns and tips for you.",
      });
    }

    const totalSpent = expense.entries.reduce((sum, e) => sum + e.amount, 0);
    const summary = expense.entries
      .map((e) => `${e.name}: Rs.${e.amount}`)
      .join(", ");

    const carried = expense.carryOver ? expense.carriedAmount || 0 : 0;
    const totalBudget = (expense.budget || 0) + carried;
    const remaining = totalBudget - totalSpent;
    const percentUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    const biggest = [...expense.entries].sort((a, b) => b.amount - a.amount)[0];
    const biggestShare = totalSpent > 0 ? Math.round((biggest.amount / totalSpent) * 100) : 0;

    const now = new Date();
    const m = Number(month);
    const y = Number(year);
    const daysInMonth = new Date(y, m, 0).getDate();
    const isCurrentMonth = now.getFullYear() === y && now.getMonth() + 1 === m;
    const daysLeft = isCurrentMonth ? daysInMonth - now.getDate() + 1 : null;
    const perDay = daysLeft && remaining > 0 ? Math.round(remaining / daysLeft) : null;

    const facts = {
      totalBudget, remaining, percentUsed, biggest, biggestShare, daysLeft, perDay,
    };

    const systemPrompt = `You write the spending summary for a personal budgeting app. Amounts are in Indian rupees; write them with the ₹ symbol.
Return JSON with one field, "summary": a single paragraph of exactly 3 complete sentences in plain text (no markdown, no lists, no questions).
Sentence 1: how they are doing against the budget, using the percentage used and the amount remaining.
Sentence 2: their biggest expense, with its amount and its share of their spending.
Sentence 3: one specific, practical suggestion based on their real numbers (for example a daily spending limit for the days left).
Use only the numbers provided; do not calculate anything yourself.`;

    const userMessage = [
      `Total budget: ₹${totalBudget}${carried ? ` (₹${expense.budget} set plus ₹${carried} carried over from last month)` : ""}`,
      `Spent so far: ₹${totalSpent} (${percentUsed}% of the budget)`,
      remaining >= 0 ? `Remaining: ₹${remaining}` : `Over budget by: ₹${Math.abs(remaining)}`,
      `Biggest expense: "${biggest.name}" at ₹${biggest.amount} (${biggestShare}% of spending)`,
      daysLeft ? `Days left this month including today: ${daysLeft}` : null,
      perDay ? `Daily allowance for the rest of the month: ₹${perDay}` : null,
      `All expenses: ${summary}`,
    ]
      .filter(Boolean)
      .join("\n");

    let insight = "";
    let source = "calculated";
    try {
      const raw = await callClaude(systemPrompt, userMessage, { schema: SUMMARY_SCHEMA });
      const candidate = extractSummary(raw);
      if (isGoodSummary(candidate)) {
        insight = candidate;
        source = "ai";
      } else {
        console.log("AI summary rejected:", JSON.stringify(candidate).slice(0, 200));
      }
    } catch (err) {
      console.log("AI summary failed, using calculated summary:", err.message);
    }

    if (!insight) insight = buildFallbackSummary(facts);

    res.status(200).json({ success: true, insight, source });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  parseEntry,
  getInsights,
};