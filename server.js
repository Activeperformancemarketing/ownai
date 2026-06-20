/**
 * Tiny backend proxy for the NVIDIA / NIM chat API.
 *
 * Why this exists:
 *   Your API key must never live in browser JS. This server holds the key
 *   (via an environment variable) and is the only thing that talks to
 *   NVIDIA. The browser only ever talks to THIS server, on a route that
 *   has no secret in it.
 *
 * Setup:
 *   1. npm install express cors node-fetch dotenv
 *   2. Create a file named ".env" next to this file containing:
 *        NVIDIA_API_KEY=nvapi-your-real-key-here
 *      (never commit .env to git — add it to .gitignore)
 *   3. Run:  node server.js
 *   4. Server listens on http://localhost:3001
 *
 * Then in ai-interface.html, change the endpoint inside callAI() to:
 *      const endpoint = "http://localhost:3001/api/chat";
 *   and remove the Authorization header and API_KEY line entirely —
 *   the browser no longer needs to know the key at all.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // omit this line if using Node 18+ (global fetch)

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());            // allow your frontend's origin to call this server
app.use(express.json());    // parse JSON request bodies

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

if (!NVIDIA_API_KEY) {
  console.warn("⚠️  NVIDIA_API_KEY is not set. Create a .env file — see comment at top of server.js.");
}

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Request body must include a string 'message' field." });
  }

  try {
    const response = await fetch(NVIDIA_ENDPOINT, {
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
    res.json({ reply });

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Failed to reach NVIDIA API." });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});
