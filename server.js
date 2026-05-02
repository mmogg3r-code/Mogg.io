require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const PDFDocument = require("pdfkit");
const OpenAI = require("openai");
const { z } = require("zod");

const app = express();
const port = process.env.PORT || 3000;
const memory = new Map();
const MEMORY_TTL_MS = 1000 * 60 * 60 * 6;
const MAX_MEMORY_ITEMS = 3;
const MAX_TRANSCRIPT_CHARS = 24000;

app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        mediaSrc: ["'self'", "blob:"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const organizeSchema = z.object({
  transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARS),
  language: z.string().optional(),
  tone: z.string().optional(),
  clientId: z.string().max(80).optional(),
});

const reportSchema = z.object({
  transcript: z.string().optional(),
  clientId: z.string().max(80).optional(),
  report: z.record(z.any()).optional(),
});

const openai =
  process.env.OPENAI_API_KEY &&
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    memory: {
      activeClients: memory.size,
      maxItemsPerClient: MAX_MEMORY_ITEMS,
      ttlHours: MEMORY_TTL_MS / 3600000,
    },
  });
});

app.post("/api/organize", async (req, res) => {
  const parsed = organizeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid thought payload.", details: parsed.error.flatten() });
  }

  const { transcript, language, tone, clientId } = parsed.data;
  const cleaned = cleanTranscript(transcript);

  if (!cleaned) {
    return res.status(400).json({ error: "Transcript is required." });
  }

  cleanMemory();
  const userMemory = getMemory(clientId);
  const previous = userMemory.items.at(-1);

  try {
    const report = openai
      ? await createAiReport(cleaned, { language, tone, previous })
      : createLocalReport(cleaned, { language, tone, previous });

    remember(clientId, report, cleaned);
    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: "Thought structuring failed.",
      details: error.message,
    });
  }
});

app.post("/api/report", async (req, res) => {
  const parsed = reportSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid PDF report payload.", details: parsed.error.flatten() });
  }

  const { report, transcript, clientId } = parsed.data;
  const currentReport = report && typeof report === "object" ? report : createLocalReport(cleanTranscript(transcript), {});

  if (!currentReport?.title) {
    return res.status(400).json({ error: "A structured report or transcript is required." });
  }

  const userMemory = getMemory(clientId);
  const filename = slugify(currentReport.title || "thinking-out-loud-report");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
  buildThoughtPdf(currentReport, userMemory.items, res);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Thinking Out Loud is running on port ${port}`);
});

async function createAiReport(transcript, context) {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You create rigorous thought-structure reports from spoken transcripts.",
          "Prioritize logic, context, accuracy, assumptions, contradictions, and useful next questions.",
          "Reference the previous recording only when it clarifies continuity. Do not invent facts.",
          "Return valid JSON only with keys:",
          "title, subtitle, prologue, tableOfContents, thoughtType, context, coreThesis, logicMap, assumptions, accuracyNotes, contradictions, openQuestions, actionPlan, previousRecordingReference, conclusion, transcriptExcerpt.",
          "tableOfContents, logicMap, assumptions, accuracyNotes, contradictions, openQuestions, actionPlan must be arrays of strings.",
          "Write as if this will become a concise book-like PDF report.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          transcript,
          selectedLanguage: context.language || "English",
          tone: context.tone || "clear",
          previousRecording: context.previous
            ? {
                title: context.previous.title,
                coreThesis: context.previous.coreThesis,
                nextQuestion: context.previous.openQuestions?.[0],
              }
            : null,
        }),
      },
    ],
    response_format: { type: "json_object" },
  });

  return normalizeReport(JSON.parse(completion.choices[0]?.message?.content || "{}"), transcript, context.previous, "openai");
}

function createLocalReport(transcript, context = {}) {
  const sentences = splitSentences(transcript);
  const firstSentence = sentences[0] || "Untitled thought";
  const thoughtType = inferThoughtType(transcript);
  const coreThesis = inferCoreIntent(transcript, firstSentence);
  const tension = inferTension(transcript);
  const previous = context.previous;
  const keywords = extractKeywords(transcript);
  const actions = inferActions(sentences, thoughtType);
  const questions = inferQuestions(thoughtType, tension, previous);

  return normalizeReport(
    {
      title: createTitle(firstSentence, thoughtType),
      subtitle: "A structured report from a spoken thinking session",
      prologue: previous
        ? `This recording continues after "${previous.title}". The new thought should be read as a refinement, contrast, or next layer unless the transcript clearly changes direction.`
        : "This report turns a raw spoken session into a structured object: context, thesis, logic, uncertainties, and next steps.",
      tableOfContents: [
        "Prologue",
        "Context and Continuity",
        "Core Thesis",
        "Logic Map",
        "Assumptions and Accuracy Notes",
        "Open Questions",
        "Action Plan",
        "Conclusion",
      ],
      thoughtType,
      context: `The transcript appears to be a ${thoughtType.toLowerCase()} with emphasis on ${keywords.slice(0, 4).join(", ") || "clarifying the idea"}.`,
      coreThesis,
      logicMap: buildLogicMap(coreThesis, tension, keywords),
      assumptions: inferAssumptions(transcript),
      accuracyNotes: inferAccuracyNotes(transcript),
      contradictions: inferContradictions(transcript),
      openQuestions: questions,
      actionPlan: actions,
      previousRecordingReference: previous
        ? `Previous recording: "${previous.title}". Useful continuity: ${previous.coreThesis || previous.summary || "compare the direction of both recordings."}`
        : "No previous recording is available in the current rolling memory.",
      conclusion: `The strongest next move is: ${actions[0] || "state the idea as one testable sentence."}`,
      transcriptExcerpt: transcript.slice(0, 1200),
    },
    transcript,
    previous,
    "local"
  );
}

function normalizeReport(value, transcript, previous, source) {
  const title = value.title || "Structured Thought Report";
  return {
    title,
    subtitle: value.subtitle || "A Thinking Out Loud report",
    generatedAt: new Date().toISOString(),
    source,
    thoughtType: value.thoughtType || inferThoughtType(transcript),
    prologue: value.prologue || "This report organizes a spoken thought into a readable structure.",
    tableOfContents: normalizeArray(value.tableOfContents, ["Prologue", "Core Thesis", "Logic Map", "Action Plan"]),
    context: value.context || "",
    coreThesis: value.coreThesis || inferCoreIntent(transcript, splitSentences(transcript)[0]),
    logicMap: normalizeArray(value.logicMap),
    assumptions: normalizeArray(value.assumptions),
    accuracyNotes: normalizeArray(value.accuracyNotes),
    contradictions: normalizeArray(value.contradictions),
    openQuestions: normalizeArray(value.openQuestions),
    actionPlan: normalizeArray(value.actionPlan),
    previousRecordingReference:
      value.previousRecordingReference ||
      (previous ? `This follows the previous recording: ${previous.title}` : "No previous recording in rolling memory."),
    conclusion: value.conclusion || "",
    transcriptExcerpt: value.transcriptExcerpt || transcript.slice(0, 1200),
    summary: value.summary || value.coreThesis || "",
  };
}

function buildThoughtPdf(report, memoryItems, stream) {
  const doc = new PDFDocument({ size: "LETTER", margin: 56, bufferPages: true });
  doc.pipe(stream);

  const titleFont = 25;
  const h1 = 17;
  const h2 = 12;
  const body = 10.5;

  doc.font("Times-Bold").fontSize(titleFont).text(report.title, { align: "center" });
  doc.moveDown(0.4);
  doc.font("Times-Italic").fontSize(13).fillColor("#555555").text(report.subtitle, { align: "center" });
  doc.moveDown(1);
  doc.font("Times-Roman").fontSize(10).fillColor("#111111").text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, { align: "center" });
  doc.moveDown(2);
  section(doc, "Prologue", report.prologue, h1, body);

  doc.addPage();
  section(doc, "Table of Contents", "", h1, body);
  report.tableOfContents.forEach((item, index) => {
    doc.font("Times-Roman").fontSize(11).text(`${index + 1}. ${item}`);
  });

  doc.addPage();
  section(doc, "Context and Continuity", report.context, h1, body);
  section(doc, "Reference to Previous Recording", report.previousRecordingReference, h2, body);
  if (memoryItems.length > 1) {
    section(doc, "Rolling Memory", "", h2, body);
    memoryItems.slice(0, -1).forEach((item, index) => {
      doc.font("Times-Roman").fontSize(body).text(`${index + 1}. ${item.title}: ${item.coreThesis || item.summary || ""}`);
    });
  }

  doc.addPage();
  section(doc, "Core Thesis", report.coreThesis, h1, body);
  listSection(doc, "Logic Map", report.logicMap, h1, body);
  listSection(doc, "Assumptions", report.assumptions, h1, body);
  listSection(doc, "Accuracy Notes", report.accuracyNotes, h1, body);
  listSection(doc, "Contradictions or Tensions", report.contradictions, h1, body);
  listSection(doc, "Open Questions", report.openQuestions, h1, body);
  listSection(doc, "Action Plan", report.actionPlan, h1, body);
  section(doc, "Conclusion", report.conclusion, h1, body);

  doc.addPage();
  section(doc, "Transcript Excerpt", report.transcriptExcerpt, h1, body);

  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i += 1) {
    doc.switchToPage(i);
    doc.font("Times-Roman").fontSize(9).fillColor("#666666").text(`Thinking Out Loud | ${i + 1}`, 56, 740, {
      align: "center",
      width: 500,
    });
  }

  doc.end();
}

function section(doc, heading, text, headingSize, bodySize) {
  doc.moveDown(0.8);
  doc.font("Times-Bold").fontSize(headingSize).fillColor("#111111").text(heading);
  if (text) {
    doc.moveDown(0.3);
    doc.font("Times-Roman").fontSize(bodySize).fillColor("#111111").text(text, {
      lineGap: 3,
      align: "left",
    });
  }
}

function listSection(doc, heading, items, headingSize, bodySize) {
  section(doc, heading, "", headingSize, bodySize);
  const list = items?.length ? items : ["No clear item found in this recording."];
  list.forEach((item) => {
    doc.font("Times-Roman").fontSize(bodySize).fillColor("#111111").text(`- ${item}`, {
      lineGap: 3,
      indent: 10,
    });
  });
}

function remember(clientId, report, transcript) {
  const userMemory = getMemory(clientId);
  userMemory.items.push({
    title: report.title,
    thoughtType: report.thoughtType,
    coreThesis: report.coreThesis,
    summary: report.summary,
    openQuestions: report.openQuestions?.slice(0, 2) || [],
    transcriptDigest: transcript.slice(0, 600),
    createdAt: Date.now(),
  });
  userMemory.items = userMemory.items.slice(-MAX_MEMORY_ITEMS);
  userMemory.updatedAt = Date.now();
}

function getMemory(clientId) {
  const key = typeof clientId === "string" && clientId ? clientId.slice(0, 80) : "anonymous";
  if (!memory.has(key)) memory.set(key, { items: [], updatedAt: Date.now() });
  return memory.get(key);
}

function cleanMemory() {
  const now = Date.now();
  for (const [key, value] of memory.entries()) {
    value.items = value.items.slice(-MAX_MEMORY_ITEMS);
    if (now - value.updatedAt > MEMORY_TTL_MS) memory.delete(key);
  }
}

function cleanTranscript(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_TRANSCRIPT_CHARS);
}

function splitSentences(text) {
  return cleanTranscript(text)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferThoughtType(text) {
  const checks = [
    ["Decision", /\b(decide|choose|option|either|whether|should i|which)\b/i],
    ["Plan", /\b(plan|roadmap|steps|timeline|launch|build|start|finish)\b/i],
    ["Problem", /\b(problem|issue|blocked|stuck|confusing|broken|not working)\b/i],
    ["Creative concept", /\b(idea|concept|story|design|brand|app|feature|create)\b/i],
    ["Reflection", /\b(feel|thinking about|realize|wonder|afraid|excited|concerned)\b/i],
  ];
  return checks.find(([, pattern]) => pattern.test(text))?.[0] || "Exploration";
}

function inferCoreIntent(text, fallback = "") {
  const patterns = [/\bi want to ([^.?!]+)/i, /\bi need to ([^.?!]+)/i, /\bthe goal is to ([^.?!]+)/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return sentenceCase(`You want to ${match[1].split(/\bbut\b|\bhowever\b/i)[0].trim().replace(/[,\s]+$/g, "")}`);
  }
  return sentenceCase(fallback || "The user is trying to clarify a thought.");
}

function inferTension(text) {
  const patterns = [/\bbut ([^.?!]+)/i, /\bhowever ([^.?!]+)/i, /\bthe challenge is ([^.?!]+)/i, /\bi'?m worried ([^.?!]+)/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return sentenceCase(match[1].trim());
  }
  return "The idea needs clearer evidence, scope, or a next test.";
}

function extractKeywords(text) {
  const stop = new Set(["about", "after", "again", "also", "because", "could", "should", "there", "their", "thing", "think", "would", "where", "which", "people", "really", "still", "with", "that", "this", "have", "want"]);
  const words = cleanTranscript(text).toLowerCase().match(/\b[a-z][a-z]{3,}\b/g) || [];
  const counts = new Map();
  words.filter((word) => !stop.has(word)).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word).slice(0, 8);
}

function buildLogicMap(coreThesis, tension, keywords) {
  return [
    `Starting claim: ${coreThesis}`,
    `Pressure point: ${tension}`,
    `Important concepts: ${keywords.slice(0, 5).join(", ") || "not enough repeated concepts detected"}.`,
    "Needed proof: identify what would make the thought true, false, or worth acting on.",
  ];
}

function inferAssumptions(text) {
  const assumptions = [];
  if (/\buser|people|someone|audience\b/i.test(text)) assumptions.push("The speaker assumes a real audience or user need exists.");
  if (/\bapp|program|system|tool\b/i.test(text)) assumptions.push("The speaker assumes software is the right form for the idea.");
  if (/\bmust|need|should\b/i.test(text)) assumptions.push("The speaker is treating at least one preference as a requirement.");
  return assumptions.length ? assumptions : ["The transcript does not state its assumptions directly; they should be tested before execution."];
}

function inferAccuracyNotes(text) {
  const notes = ["Separate directly stated facts from interpretations before making decisions."];
  if (/\balways|never|everyone|no one\b/i.test(text)) notes.push("Absolute language appears; verify it with evidence.");
  if (!/\b(number|percent|date|cost|time|because|evidence)\b/i.test(text)) notes.push("The transcript has limited measurable evidence; future recordings should add specifics.");
  return notes;
}

function inferContradictions(text) {
  const items = [];
  if (/\bbut\b/i.test(text)) items.push(`The main tension is: ${inferTension(text)}`);
  if (/\bfast|quick\b/i.test(text) && /\bcomplete|perfect|polished\b/i.test(text)) items.push("Speed and completeness may be competing priorities.");
  return items.length ? items : ["No direct contradiction detected; the main risk is under-specified scope."];
}

function inferActions(sentences, thoughtType) {
  const explicit = sentences
    .filter((sentence) => /\b(need|should|must|plan|build|create|finish|start|test|deploy|add|fix)\b/i.test(sentence))
    .map((sentence) => sentence.split(/\bbut\b|\bhowever\b/i)[0].replace(/^i\s+/i, "").trim())
    .filter((sentence) => sentence.length <= 140)
    .slice(0, 2);
  const defaults = {
    Decision: ["Write the two strongest options and the cost of each.", "Choose the option that creates the next testable step."],
    Plan: ["Define the first milestone.", "List the smallest shippable version.", "Set the next action for today."],
    Problem: ["Name the exact failure point.", "Test one fix at a time.", "Record what changed after each attempt."],
    "Creative concept": ["Describe the audience in one sentence.", "Define the core experience.", "Build the smallest proof of concept."],
    Reflection: ["Name the feeling and the fact separately.", "Write what is known, assumed, and needed next."],
    Exploration: ["Circle the strongest sentence.", "Turn it into one testable question.", "Pick one next step."],
  };
  return [...explicit, ...(defaults[thoughtType] || defaults.Exploration)].slice(0, 5);
}

function inferQuestions(thoughtType, tension, previous) {
  const base = {
    Decision: ["What tradeoff is actually being chosen?", "What evidence would make the decision obvious?"],
    Plan: ["What does version one need to do?", "What can wait until after the first launch?"],
    Problem: ["What changed most recently?", "What evidence would prove the fix worked?"],
    "Creative concept": ["Who is this for?", "What should the user understand after using it?"],
    Reflection: ["What is fact, and what is interpretation?", "What would a calmer next step look like?"],
    Exploration: ["What is the real question inside this thought?", "What part feels most alive or urgent?"],
  };
  return [
    ...(base[thoughtType] || base.Exploration),
    `How can this tension be reduced: ${tension}`,
    previous ? `How does this recording change or continue "${previous.title}"?` : "What should the next recording clarify?",
  ].slice(0, 5);
}

function createTitle(firstSentence, thoughtType) {
  const compact = firstSentence.length > 62 ? `${firstSentence.slice(0, 59)}...` : firstSentence;
  return `${thoughtType}: ${compact}`;
}

function normalizeArray(value, fallback = []) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).slice(0, 8);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

function sentenceCase(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : cleaned;
}

function slugify(value) {
  return String(value || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}
