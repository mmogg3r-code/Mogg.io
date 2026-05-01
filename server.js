require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const openai =
  process.env.OPENAI_API_KEY &&
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    azureSpeechConfigured: Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.get("/api/speech-token", async (_req, res) => {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return res.status(503).json({
      error: "Azure Speech is not configured. Add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.",
    });
  }

  try {
    const tokenResponse = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!tokenResponse.ok) {
      const details = await tokenResponse.text();
      return res.status(tokenResponse.status).json({
        error: "Azure Speech token request failed.",
        details,
      });
    }

    const token = await tokenResponse.text();
    res.json({ token, region });
  } catch (error) {
    res.status(500).json({
      error: "Unable to request Azure Speech token.",
      details: error.message,
    });
  }
});

app.post("/api/organize", async (req, res) => {
  const { transcript, language, tone } = req.body || {};

  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ error: "Transcript is required." });
  }

  if (!openai) {
    return res.json(createOfflineResponse(transcript, language, tone));
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You turn raw spoken thoughts into organized ideas. Reply in the user's selected language. Be clear, practical, and structured. Return valid JSON only with keys title, summary, organizedIdea, actionItems, questions, spokenResponse.",
        },
        {
          role: "user",
          content: JSON.stringify({
            transcript,
            language: language || "English",
            tone: tone || "thoughtful",
          }),
        },
      ],
      response_format: { type: "json_object" },
    });

    const text = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);

    res.json({
      title: parsed.title || "Organized Idea",
      summary: parsed.summary || "",
      organizedIdea: parsed.organizedIdea || transcript.trim(),
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      spokenResponse: parsed.spokenResponse || parsed.summary || "I organized your idea.",
      source: "openai",
    });
  } catch (error) {
    res.status(500).json({
      error: "AI organization failed.",
      details: error.message,
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Thinking Out Loud is running on port ${port}`);
});

function createOfflineResponse(transcript, language, tone) {
  const cleaned = transcript.trim().replace(/\s+/g, " ");
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const firstSentence = sentences[0] || cleaned;
  const actionItems = sentences
    .filter((sentence) => /\b(need|should|must|plan|build|create|call|send|finish|start)\b/i.test(sentence))
    .slice(0, 4);

  return {
    title: firstSentence.length > 72 ? `${firstSentence.slice(0, 69)}...` : firstSentence,
    summary: cleaned.length > 220 ? `${cleaned.slice(0, 217)}...` : cleaned,
    organizedIdea: cleaned,
    actionItems,
    questions: [
      "What is the first concrete step?",
      "Who is the intended audience?",
      "What would make this idea feel complete?",
    ],
    spokenResponse:
      "I organized your thought locally. Add an OpenAI API key for deeper analysis and multilingual responses.",
    source: "offline",
    language,
    tone,
  };
}
