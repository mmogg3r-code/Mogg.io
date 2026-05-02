const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const MAX_RECORDING_SECONDS = 300;

const languages = [
  ["English", "en-US"],
  ["French", "fr-FR"],
  ["Romanian", "ro-RO"],
  ["Spanish", "es-ES"],
  ["Chinese", "zh-CN"],
  ["Japanese", "ja-JP"],
  ["Hungarian", "hu-HU"],
  ["Portuguese", "pt-BR"],
  ["Russian", "ru-RU"],
  ["Arabic", "ar-SA"],
  ["Hindi", "hi-IN"],
  ["German", "de-DE"],
  ["Korean", "ko-KR"],
  ["Italian", "it-IT"],
];

const state = {
  recognition: null,
  finalTranscript: "",
  isRecording: false,
  startedAt: 0,
  timerId: null,
  currentReport: null,
  clientId: getClientId(),
};

const elements = {
  clearButton: document.querySelector("#clearButton"),
  downloadPdfButton: document.querySelector("#downloadPdfButton"),
  languageSelect: document.querySelector("#languageSelect"),
  memoryStatus: document.querySelector("#memoryStatus"),
  navRecordButton: document.querySelector("#navRecordButton"),
  organizeButton: document.querySelector("#organizeButton"),
  recordButton: document.querySelector("#recordButton"),
  recordingState: document.querySelector("#recordingState"),
  result: document.querySelector("#result"),
  stopButton: document.querySelector("#stopButton"),
  systemStatus: document.querySelector("#systemStatus"),
  timerReadout: document.querySelector("#timerReadout"),
  toneSelect: document.querySelector("#toneSelect"),
  transcript: document.querySelector("#transcript"),
  voiceOrb: document.querySelector("#voiceOrb"),
};

init();

async function init() {
  populateLanguages();
  bindEvents();
  updateMemoryStatus();
  updateTimer(MAX_RECORDING_SECONDS);
  await checkStatus();

  if (!SpeechRecognition) {
    setStatus("Browser speech recognition unavailable", "warn");
    elements.recordButton.disabled = true;
    elements.navRecordButton.disabled = true;
    elements.recordingState.textContent = "Use Chrome or Edge for microphone dictation.";
  }
}

function populateLanguages() {
  elements.languageSelect.innerHTML = languages
    .map(([name], index) => `<option value="${index}">${name}</option>`)
    .join("");
}

function bindEvents() {
  elements.recordButton.addEventListener("click", startRecording);
  elements.navRecordButton.addEventListener("click", startRecording);
  elements.stopButton.addEventListener("click", stopRecording);
  elements.organizeButton.addEventListener("click", () => {
    const transcript = elements.transcript.value.trim();
    if (transcript) {
      elements.recordingState.textContent = "Structuring your thought report...";
      organizeTranscript(transcript);
    } else {
      elements.recordingState.textContent = "Add a transcript or speak first.";
    }
  });
  elements.clearButton.addEventListener("click", clearAll);
  elements.downloadPdfButton.addEventListener("click", downloadPdf);
}

async function checkStatus() {
  try {
    const response = await fetch("/api/health");
    const status = await response.json();
    const parts = [];
    parts.push(status.aiConfigured ? "AI reasoning ready" : "local reasoning mode");
    parts.push(`memory ${status.memory?.maxItemsPerClient || 3} reports`);
    setStatus(parts.join(" | "), "ok");
  } catch {
    setStatus("Service check unavailable", "warn");
  }
}

function startRecording() {
  if (!SpeechRecognition || state.isRecording) return;

  state.finalTranscript = elements.transcript.value.trim();
  state.recognition = new SpeechRecognition();
  state.recognition.lang = getSelectedLanguage().code;
  state.recognition.continuous = true;
  state.recognition.interimResults = true;

  state.recognition.onstart = () => {
    state.isRecording = true;
    state.startedAt = Date.now();
    elements.voiceOrb.classList.add("listening");
    elements.recordButton.disabled = true;
    elements.navRecordButton.disabled = true;
    elements.stopButton.disabled = false;
    elements.recordingState.textContent = "Recording. Stop when done, or wait for the 5-minute cap.";
    state.timerId = window.setInterval(tickTimer, 250);
  };

  state.recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const phrase = event.results[index][0].transcript;
      if (event.results[index].isFinal) {
        state.finalTranscript = `${state.finalTranscript} ${phrase}`.trim();
      } else {
        interim += phrase;
      }
    }
    elements.transcript.value = `${state.finalTranscript} ${interim}`.trim();
  };

  state.recognition.onerror = (event) => {
    elements.recordingState.textContent = `Speech recognition stopped: ${event.error}`;
  };

  state.recognition.onend = async () => {
    finishRecordingUi();
    const transcript = elements.transcript.value.trim();
    if (transcript) {
      elements.recordingState.textContent = "Structuring your thought report...";
      await organizeTranscript(transcript);
    } else {
      elements.recordingState.textContent = "No speech captured yet.";
    }
  };

  state.recognition.start();
}

function tickTimer() {
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsed);
  updateTimer(remaining);
  if (remaining <= 0) stopRecording();
}

function updateTimer(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  elements.timerReadout.textContent = `${minutes}:${rest}`;
}

function stopRecording() {
  if (state.recognition && state.isRecording) state.recognition.stop();
}

function finishRecordingUi() {
  state.isRecording = false;
  window.clearInterval(state.timerId);
  state.timerId = null;
  updateTimer(MAX_RECORDING_SECONDS);
  elements.voiceOrb.classList.remove("listening");
  elements.recordButton.disabled = false;
  elements.navRecordButton.disabled = false;
  elements.stopButton.disabled = true;
}

async function organizeTranscript(transcript) {
  try {
    const response = await fetch("/api/organize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        clientId: state.clientId,
        language: getSelectedLanguage().name,
        tone: elements.toneSelect.value,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to structure transcript.");

    state.currentReport = data;
    rememberLocally(data);
    renderReport(data);
    updateMemoryStatus();
    elements.downloadPdfButton.disabled = false;
    elements.recordingState.textContent = data.source === "local" ? "Structured locally. PDF is ready." : "Structured with AI. PDF is ready.";
  } catch (error) {
    elements.recordingState.textContent = error.message;
  }
}

function renderReport(report) {
  const list = (title, items) =>
    items?.length ? `<h4>${escapeHtml(title)}</h4><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";

  elements.result.classList.remove("empty-state");
  elements.result.innerHTML = `
    <h3>${escapeHtml(report.title)}</h3>
    <div class="thought-meta">
      <span>Type: ${escapeHtml(report.thoughtType || "Exploration")}</span>
      <span>Source: ${escapeHtml(report.source || "local")}</span>
      <span>Generated: ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</span>
    </div>
    <h4>Prologue</h4>
    <p>${escapeHtml(report.prologue || "")}</p>
    <h4>Context</h4>
    <p>${escapeHtml(report.context || "")}</p>
    <h4>Core Thesis</h4>
    <p>${escapeHtml(report.coreThesis || "")}</p>
    ${list("Logic Map", report.logicMap)}
    ${list("Assumptions", report.assumptions)}
    ${list("Accuracy Notes", report.accuracyNotes)}
    ${list("Contradictions or Tensions", report.contradictions)}
    ${list("Open Questions", report.openQuestions)}
    ${list("Action Plan", report.actionPlan)}
    <h4>Conclusion</h4>
    <p>${escapeHtml(report.conclusion || "")}</p>
  `;
}

async function downloadPdf() {
  if (!state.currentReport) return;

  const response = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      report: state.currentReport,
      clientId: state.clientId,
      transcript: elements.transcript.value,
    }),
  });

  if (!response.ok) {
    elements.recordingState.textContent = "PDF generation failed.";
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(state.currentReport.title || "thought-report")}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function clearAll() {
  elements.transcript.value = "";
  state.finalTranscript = "";
  state.currentReport = null;
  elements.downloadPdfButton.disabled = true;
  elements.result.classList.add("empty-state");
  elements.result.textContent = "Your structured report will appear after you finish speaking.";
  elements.recordingState.textContent = "Press start. The session stops automatically at 5:00.";
}

function rememberLocally(report) {
  const items = JSON.parse(localStorage.getItem("tol_memory") || "[]");
  items.push({
    title: report.title,
    coreThesis: report.coreThesis,
    generatedAt: report.generatedAt,
  });
  localStorage.setItem("tol_memory", JSON.stringify(items.slice(-3)));
}

function updateMemoryStatus() {
  const items = JSON.parse(localStorage.getItem("tol_memory") || "[]");
  elements.memoryStatus.textContent = items.length
    ? `${items.length} cached; last: ${items.at(-1).title}`
    : "No previous recording";
}

function getSelectedLanguage() {
  const [name, code] = languages[Number(elements.languageSelect.value)] || languages[0];
  return { name, code };
}

function getClientId() {
  const existing = localStorage.getItem("tol_client_id");
  if (existing) return existing;
  const value = crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem("tol_client_id", value);
  return value;
}

function setStatus(text, kind) {
  elements.systemStatus.textContent = text;
  elements.systemStatus.dataset.kind = kind;
}

function slugify(value) {
  return String(value || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
