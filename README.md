# Thinking Out Loud

A voice-first web app for speaking freely into the microphone, automatically transcribing the thought, structuring its logic, and producing a complete book-like PDF report.

## Features

- Browser microphone dictation with a 5-minute maximum recording limit.
- Thought structuring into context, thesis, logic map, assumptions, accuracy notes, contradictions, open questions, and action plan.
- Book-like PDF report generation with prologue, table of contents, chapters, conclusion, and transcript excerpt.
- Rolling server memory that references the previous recording while keeping only a small short-lived cache.
- Production-friendly open-source stack: Express, Helmet, compression, Zod, PDFKit, and optional OpenAI reasoning.
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
OPENAI_API_KEY=your_openai_key_optional
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

`OPENAI_API_KEY` is optional. Without it, the app uses the local thought-structure engine.

## Memory Model

The server keeps a tiny rolling cache per browser client:

- Maximum 3 recent structured reports.
- Cache expires after 6 hours.
- The next report can reference the previous recording for continuity.
- Full transcripts are not stored long-term by the app.

## Hostinger Deployment Notes

Use the domain `https://tuntunsahur.com` or `https://www.tuntunsahur.com`.

1. Upload this project to your Hostinger site folder, usually `public_html`.
2. In Hostinger, create a Node.js application for the domain.
3. Set the startup file to `server.js`.
4. Use Node.js `20.x`, `22.x`, or `24.x`.
5. Run `npm install` from Hostinger's terminal or Node.js setup screen.
6. Add the environment variables above.
7. Start or restart the Node.js app.

The app serves the frontend and backend from the same process, so no separate build step is required.

## Security Notes

- Do not place OpenAI keys in frontend files.
- The PDF report is generated server-side and streamed back to the browser.
- Microphone access requires HTTPS in production. Your Hostinger domain already uses HTTPS.
