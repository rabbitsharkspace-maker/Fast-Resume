# AI FastResume 🚀
### ATS-Optimised Resume & Career Suite

An AI-powered career platform that helps you build ATS-optimised resumes, portfolios, and career strategies — using **your own API key** from any major AI provider.

---

## ✨ Features

| Module | What it does |
|--------|-------------|
| 📄 **Resume Optimiser** | Paste a job description → AI rewrites your resume to pass ATS filters with STAR-method bullets |
| 🎨 **Portfolio Builder** | Upload projects, images, PDFs → AI generates professional descriptions and a shareable portfolio page |
| 🔮 **Career Path AI** | Predicts your next 3–5 year career trajectory, identifies skill gaps, and builds an action plan |
| 🤖 **Mock Interview** | Practice interviews with an AI recruiter, get scored feedback on your answers |
| 💬 **AI Career Coach** | Context-aware chat that knows your resume and portfolio |

---

## 🔑 Bring Your Own API Key

No subscription needed. Add your own API key in **Settings** — supports:

- **Google Gemini** — `gemini-2.5-pro`, `gemini-2.5-flash`, or any model ID
- **OpenAI** — `gpt-4o`, `gpt-4.1`, `o3`, or any model ID
- **Anthropic Claude** — `claude-sonnet-4-6`, `claude-opus-4-5`, or any model ID
- **Nvidia NIM** — Llama, Nemotron, or any model ID

Type any model ID manually — works with models released after this repo was created.

---

## 🛠 Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + Vite
- **Backend:** Node.js + Express (API proxy for secure key forwarding)
- **AI:** Google Gemini SDK / OpenAI API / Anthropic API / Nvidia NIM
- **Docs:** Mammoth (.docx parsing) + PDF.js

---

## 🚀 Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npx tsx server.ts
```

Open **http://localhost:3000** → go to Settings → add your API key → done.

---

## ☁️ Deploy to Cloudflare Pages

```bash
# Build
npm run build

# Deploy the /dist folder to Cloudflare Pages
```

Users visiting the site enter their own API key in Settings. No server-side keys required.

---

## 📁 Project Structure

```
├── App.tsx                 # Main app + routing
├── server.ts               # Express API proxy (forwards requests to AI providers)
├── components/
│   ├── InputSection.tsx    # Resume + JD upload
│   ├── AnalysisDashboard.tsx
│   ├── ResumePreview.tsx   # Editor + PDF export
│   ├── PortfolioGenerator.tsx
│   ├── MockInterview.tsx
│   ├── CareerPathPredictor.tsx
│   └── AIChatbot.tsx
├── services/
│   └── geminiService.ts    # All AI API calls (Gemini / OpenAI / Claude / Nvidia)
└── types.ts                # TypeScript interfaces
```

---

## 🌐 Supported Languages

English · 中文 · 日本語 · 한국어 · Español · Deutsch · Français · العربية

---

**Built by [RabbitShark](https://github.com/rabbitsharkspace-maker)**
