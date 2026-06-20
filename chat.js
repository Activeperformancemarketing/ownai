// Vercel serverless function — lives at /api/chat
// Deployed automatically by Vercel because it's inside the /api folder.
// This is the ONLY place your NVIDIA key should exist. Set it as an
// environment variable in the Vercel dashboard (see instructions below),
// never commit it into a file.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Request body must include a string 'message' field." });
  }

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

  if (!NVIDIA_API_KEY) {
    return res.status(500).json({ error: "NVIDIA_API_KEY environment variable is not set on the server." });
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
        messages: [{ role: "user", content: message }],
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
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Failed to reach NVIDIA API." });
  }
}
