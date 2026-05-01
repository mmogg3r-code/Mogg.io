# Thinking Out Loud

A voice-first web app for speaking freely into the microphone, automatically transcribing the thought, organizing it with AI, and reading the answer back with Microsoft Azure neural voices.

## Features

- Browser microphone dictation with automatic processing when recording ends.
- AI organization into title, summary, structured thought, action items, and useful questions.
- Microsoft Azure neural voice playback.
- Language and accent presets for English, French, Romanian, Spanish, Chinese, Japanese, Hungarian, Portuguese, Russian, Arabic, Hindi, German, Korean, and Italian.
- Browser speech synthesis fallback when Azure credentials are not configured.
- Local formatter fallback when `OPENAI_API_KEY` is not configured.

## Local Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Required Environment Variables

Add these in Hostinger's Node.js app environment settings or in a `.env` file on the server:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=eastus
PORT=3000
```

## Hostinger Deployment Notes

Use the domain `https://tuntunsahur.com` or `https://www.tuntunsahur.com`.

1. Upload this project to your Hostinger site folder, usually `public_html`.
2. In Hostinger, create a Node.js application for the domain.
3. Set the startup file to `server.js`.
4. Use Node.js `20.x`, `22.x`, or `24.x`.
5. Run `npm install` from Hostinger's terminal or Node.js setup screen.
6. Add the environment variables above.
7. Start or restart the Node.js app.

The app serves the frontend and backend from the same process. The `npm run build` command copies frontend assets to both `build/` and `dist/` for hosts that require an output directory.

## Security Notes

- Do not place Azure Speech or OpenAI keys in frontend files.
- `/api/speech-token` returns short-lived Azure authorization tokens so the browser never sees the Azure subscription key.
- Microphone access requires HTTPS in production. Your Hostinger domain already uses HTTPS.
