const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const languages = [
  {
    name: "English",
    recognition: "en-US",
    voices: [
      ["English - United States - Jenny", "en-US-JennyNeural"],
      ["English - United States - Guy", "en-US-GuyNeural"],
      ["English - United Kingdom - Libby", "en-GB-LibbyNeural"],
      ["English - Australia - Natasha", "en-AU-NatashaNeural"],
      ["English - Canada - Clara", "en-CA-ClaraNeural"],
      ["English - India - Neerja", "en-IN-NeerjaNeural"],
    ],
  },
  {
    name: "French",
    recognition: "fr-FR",
    voices: [
      ["French - France - Denise", "fr-FR-DeniseNeural"],
      ["French - France - Henri", "fr-FR-HenriNeural"],
      ["French - Canada - Sylvie", "fr-CA-SylvieNeural"],
      ["French - Switzerland - Ariane", "fr-CH-ArianeNeural"],
    ],
  },
  {
    name: "Romanian",
    recognition: "ro-RO",
    voices: [
      ["Romanian - Romania - Alina", "ro-RO-AlinaNeural"],
      ["Romanian - Romania - Emil", "ro-RO-EmilNeural"],
    ],
  },
  {
    name: "Spanish",
    recognition: "es-ES",
    voices: [
      ["Spanish - Spain - Elvira", "es-ES-ElviraNeural"],
      ["Spanish - Mexico - Dalia", "es-MX-DaliaNeural"],
      ["Spanish - United States - Paloma", "es-US-PalomaNeural"],
      ["Spanish - Argentina - Elena", "es-AR-ElenaNeural"],
      ["Spanish - Colombia - Salome", "es-CO-SalomeNeural"],
    ],
  },
  {
    name: "Chinese",
    recognition: "zh-CN",
    voices: [
      ["Chinese - Mandarin Mainland - Xiaoxiao", "zh-CN-XiaoxiaoNeural"],
      ["Chinese - Mandarin Mainland - Yunxi", "zh-CN-YunxiNeural"],
      ["Chinese - Hong Kong Cantonese - HiuMaan", "zh-HK-HiuMaanNeural"],
      ["Chinese - Taiwan Mandarin - HsiaoChen", "zh-TW-HsiaoChenNeural"],
    ],
  },
  {
    name: "Japanese",
    recognition: "ja-JP",
    voices: [
      ["Japanese - Nanami", "ja-JP-NanamiNeural"],
      ["Japanese - Keita", "ja-JP-KeitaNeural"],
    ],
  },
  {
    name: "Hungarian",
    recognition: "hu-HU",
    voices: [
      ["Hungarian - Noemi", "hu-HU-NoemiNeural"],
      ["Hungarian - Tamas", "hu-HU-TamasNeural"],
    ],
  },
  {
    name: "Portuguese",
    recognition: "pt-BR",
    voices: [
      ["Portuguese - Brazil - Francisca", "pt-BR-FranciscaNeural"],
      ["Portuguese - Brazil - Antonio", "pt-BR-AntonioNeural"],
      ["Portuguese - Portugal - Raquel", "pt-PT-RaquelNeural"],
    ],
  },
  {
    name: "Russian",
    recognition: "ru-RU",
    voices: [
      ["Russian - Svetlana", "ru-RU-SvetlanaNeural"],
      ["Russian - Dmitry", "ru-RU-DmitryNeural"],
    ],
  },
  {
    name: "Arabic",
    recognition: "ar-SA",
    voices: [
      ["Arabic - Saudi Arabia - Zariyah", "ar-SA-ZariyahNeural"],
      ["Arabic - Egypt - Salma", "ar-EG-SalmaNeural"],
      ["Arabic - UAE - Fatima", "ar-AE-FatimaNeural"],
    ],
  },
  {
    name: "Hindi",
    recognition: "hi-IN",
    voices: [
      ["Hindi - Swara", "hi-IN-SwaraNeural"],
      ["Hindi - Madhur", "hi-IN-MadhurNeural"],
    ],
  },
  {
    name: "German",
    recognition: "de-DE",
    voices: [
      ["German - Germany - Katja", "de-DE-KatjaNeural"],
      ["German - Germany - Conrad", "de-DE-ConradNeural"],
      ["German - Austria - Ingrid", "de-AT-IngridNeural"],
    ],
  },
  {
    name: "Korean",
    recognition: "ko-KR",
    voices: [
      ["Korean - SunHi", "ko-KR-SunHiNeural"],
      ["Korean - InJoon", "ko-KR-InJoonNeural"],
    ],
  },
  {
    name: "Italian",
    recognition: "it-IT",
    voices: [
      ["Italian - Elsa", "it-IT-ElsaNeural"],
      ["Italian - Diego", "it-IT-DiegoNeural"],
    ],
  },
];

const state = {
  recognition: null,
  finalTranscript: "",
  lastSpokenText: "",
  isRecording: false,
};

const elements = {
  autoSpeak: document.querySelector("#autoSpeak"),
  clearButton: document.querySelector("#clearButton"),
  languageSelect: document.querySelector("#languageSelect"),
  organizeButton: document.querySelector("#organizeButton"),
  navRecordButton: document.querySelector("#navRecordButton"),
  recordButton: document.querySelector("#recordButton"),
  recordingState: document.querySelector("#recordingState"),
  result: document.querySelector("#result"),
  speakButton: document.querySelector("#speakButton"),
  stopButton: document.querySelector("#stopButton"),
  systemStatus: document.querySelector("#systemStatus"),
  toneSelect: document.querySelector("#toneSelect"),
  transcript: document.querySelector("#transcript"),
  voiceOrb: document.querySelector("#voiceOrb"),
  voiceSelect: document.querySelector("#voiceSelect"),
};

init();

async function init() {
  populateLanguages();
  bindEvents();
  await checkStatus();

  if (!SpeechRecognition) {
    setStatus("Browser speech recognition unavailable", "warn");
    elements.recordButton.disabled = true;
    elements.recordingState.textContent = "Use Chrome or Edge for microphone dictation.";
  }
}

function populateLanguages() {
  elements.languageSelect.innerHTML = languages
    .map((language, index) => `<option value="${index}">${language.name}</option>`)
    .join("");
  updateVoices();
}

function updateVoices() {
  const language = getSelectedLanguage();
  elements.voiceSelect.innerHTML = language.voices
    .map(([label, id]) => `<option value="${id}">${label}</option>`)
    .join("");
}

function bindEvents() {
  elements.languageSelect.addEventListener("change", () => {
    updateVoices();
    if (state.recognition) {
      state.recognition.lang = getSelectedLanguage().recognition;
    }
  });

  elements.recordButton.addEventListener("click", startRecording);
  elements.navRecordButton.addEventListener("click", startRecording);
  elements.stopButton.addEventListener("click", stopRecording);
  elements.organizeButton.addEventListener("click", () => {
    const transcript = elements.transcript.value.trim();
    if (transcript) {
      elements.recordingState.textContent = "Organizing your idea...";
      organizeTranscript(transcript);
    } else {
      elements.recordingState.textContent = "Add a transcript or speak first.";
    }
  });
  elements.clearButton.addEventListener("click", clearAll);
  elements.speakButton.addEventListener("click", () => speakText(state.lastSpokenText));
}

async function checkStatus() {
  try {
    const response = await fetch("/api/health");
    const status = await response.json();
    const parts = [];
    parts.push(status.aiConfigured ? "AI ready" : "AI offline");
    parts.push(status.azureSpeechConfigured ? "Azure voice ready" : "Azure voice missing");
    setStatus(parts.join(" | "), status.aiConfigured && status.azureSpeechConfigured ? "ok" : "warn");
  } catch {
    setStatus("Service check unavailable", "warn");
  }
}

function startRecording() {
  if (!SpeechRecognition || state.isRecording) return;

  state.finalTranscript = elements.transcript.value.trim();
  state.recognition = new SpeechRecognition();
  state.recognition.lang = getSelectedLanguage().recognition;
  state.recognition.continuous = true;
  state.recognition.interimResults = true;

  state.recognition.onstart = () => {
    state.isRecording = true;
    elements.voiceOrb.classList.add("listening");
    elements.recordButton.disabled = true;
    elements.stopButton.disabled = false;
    elements.recordingState.textContent = "Listening. Pause or press stop when your thought is complete.";
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
    const transcript = elements.transcript.value.trim();
    state.isRecording = false;
    elements.voiceOrb.classList.remove("listening");
    elements.recordButton.disabled = false;
    elements.stopButton.disabled = true;

    if (transcript) {
      elements.recordingState.textContent = "Organizing your idea...";
      await organizeTranscript(transcript);
    } else {
      elements.recordingState.textContent = "No speech captured yet.";
    }
  };

  state.recognition.start();
}

function stopRecording() {
  if (state.recognition && state.isRecording) {
    state.recognition.stop();
  }
}

async function organizeTranscript(transcript) {
  try {
    const response = await fetch("/api/organize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        language: getSelectedLanguage().name,
        tone: elements.toneSelect.value,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to organize transcript.");

    renderResult(data);
    state.lastSpokenText = data.spokenResponse || data.summary || data.organizedIdea;
    elements.speakButton.disabled = !state.lastSpokenText;
    elements.recordingState.textContent = data.source === "offline" ? "Organized locally." : "Organized by AI.";

    if (elements.autoSpeak.checked && state.lastSpokenText) {
      await speakText(state.lastSpokenText);
    }
  } catch (error) {
    elements.recordingState.textContent = error.message;
  }
}

function renderResult(data) {
  const actions = data.actionItems?.length
    ? `<h4>Action Items</h4><ul>${data.actionItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const questions = data.questions?.length
    ? `<h4>Useful Questions</h4><ul>${data.questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";

  elements.result.classList.remove("empty-state");
  elements.result.innerHTML = `
    <h3>${escapeHtml(data.title || "Organized Idea")}</h3>
    <p>${escapeHtml(data.summary || "")}</p>
    <h4>Structured Thought</h4>
    <p>${escapeHtml(data.organizedIdea || "")}</p>
    ${actions}
    ${questions}
  `;
}

async function speakText(text) {
  if (!text) return;

  if (!window.SpeechSDK) {
    speakWithBrowser(text);
    return;
  }

  try {
    const response = await fetch("/api/speech-token");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Azure Speech unavailable.");

    const speechConfig = window.SpeechSDK.SpeechConfig.fromAuthorizationToken(data.token, data.region);
    speechConfig.speechSynthesisVoiceName = elements.voiceSelect.value;
    const synthesizer = new window.SpeechSDK.SpeechSynthesizer(speechConfig);

    await new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        () => {
          synthesizer.close();
          resolve();
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });
  } catch (error) {
    console.warn(error);
    speakWithBrowser(text);
  }
}

function speakWithBrowser(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getSelectedLanguage().recognition;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function clearAll() {
  elements.transcript.value = "";
  state.finalTranscript = "";
  state.lastSpokenText = "";
  elements.speakButton.disabled = true;
  elements.result.classList.add("empty-state");
  elements.result.textContent = "Your formatted idea and AI response will appear after you finish speaking.";
  elements.recordingState.textContent = "Choose a language, then press start.";
}

function getSelectedLanguage() {
  return languages[Number(elements.languageSelect.value)] || languages[0];
}

function setStatus(text, kind) {
  elements.systemStatus.textContent = text;
  elements.systemStatus.dataset.kind = kind;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
