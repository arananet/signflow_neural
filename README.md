<div align="center">

# SignFlow — Interactive Sign Language Learning

**Master American Sign Language with real-time AI feedback powered by MediaPipe and Gemini.**

</div>

## About

SignFlow is an interactive web application that teaches American Sign Language (ASL) using your webcam. It uses MediaPipe for real-time hand tracking and selfie segmentation, combined with Google's Gemini AI to validate your gestures and provide instant feedback.

### Features

- **Real-time hand tracking** — MediaPipe detects and draws hand landmarks on a live camera feed
- **AI gesture validation** — Gemini analyzes your signs and gives feedback with confidence scores
- **Background blur** — Selfie segmentation keeps focus on you with adjustable blur
- **Lesson mode** — Step through alphabet letters and common signs
- **Name Game mode** — Spell your name letter by letter in ASL
- **Bilingual** — Full English and Spanish support

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   ```
   npm run dev
   ```

## Developer

**Eduardo Arana** — 2026
