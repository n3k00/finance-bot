const CHAT_SYSTEM = `You are a concise Burmese-speaking assistant inside a Telegram finance bot.

Answer naturally in Burmese.
The bot can:
- record personal expenses when a message contains an amount, e.g. "coffee 2500"
- record money ledger entries with /m, /in, /out
- answer reports for today, this month, and last month

Do not claim that you saved data unless the user used the record flow and confirmed.
For money totals, tell the user to ask a report question if no report data is provided.
Keep answers short, practical, and friendly. No markdown tables unless asked.`;

export async function answerChat(opts: {
  text: string;
  aiKey: string;
  baseUrl: string;
  model: string;
}): Promise<string> {
  const endpoint = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model: opts.model || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: CHAT_SYSTEM },
      { role: "user", content: opts.text },
    ],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.aiKey}`,
      "api-key": opts.aiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`AI chat ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return text.trim() || "ဘာကူညီပေးရမလဲ ပြောပါ။";
}
