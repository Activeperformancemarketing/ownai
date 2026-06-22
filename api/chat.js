// Vercel serverless function — lives at /api/chat
// Holds two secrets server-side: NVIDIA_API_KEY and TAVILY_API_KEY.
// Set both as environment variables in the Vercel dashboard — never commit
// real keys into this file.

async function searchWeb(query, apiKey) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      max_results: 5,
      search_depth: "basic"
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Tavily API error:", response.status, errText);
    throw new Error(`Search failed (${response.status})`);
  }

  const data = await response.json();

  const results = (data.results || [])
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`)
    .join("\n\n");

  return { answer: data.answer || null, results };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // `messages` is the full conversation so far: [{role: "user"|"assistant", content: "..."}]
  // `search` only applies to the LATEST user message.
  const { messages, search } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Request body must include a non-empty 'messages' array." });
  }

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

  if (!NVIDIA_API_KEY) {
    return res.status(500).json({ error: "NVIDIA_API_KEY environment variable is not set on the server." });
  }

  // Work on a copy so we can augment just the last message without mutating the original history.
  const upstreamMessages = messages.map(m => ({ role: m.role, content: m.content }));
  let citations = [];

  if (search) {
    if (!TAVILY_API_KEY) {
      return res.status(500).json({ error: "TAVILY_API_KEY environment variable is not set on the server." });
    }

    const lastUserMessage = upstreamMessages[upstreamMessages.length - 1];

    try {
      const { answer, results } = await searchWeb(lastUserMessage.content, TAVILY_API_KEY);

      lastUserMessage.content =
        `You have been given live web search results below. Use them to answer ` +
        `the user's question accurately and cite sources as [1], [2], etc. where relevant. ` +
        `If the results don't actually answer the question, say so rather than guessing.\n\n` +
        (answer ? `Quick answer hint: ${answer}\n\n` : "") +
        `Search results:\n${results || "(no results found)"}\n\n` +
        `User's question: ${lastUserMessage.content}`;

      citations = (results.match(/Source: (.+)/g) || []).map(s => s.replace("Source: ", ""));
    } catch (err) {
      console.error("Search step failed:", err);
      return res.status(502).json({ error: "Web search failed. Try again or turn off search for this message." });
    }
  }

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NVIDIA_API_KEY}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: upstreamMessages,
        temperature: 1,
        top_p: 1,
        max_tokens: 1024,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("NVIDIA API error:", response.status, errText);
      return res.status(response.status).json({ error: `Upstream error (${response.status})` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "(empty response)";
    return res.status(200).json({ reply, citations });

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Failed to reach NVIDIA API." });
  }
}
