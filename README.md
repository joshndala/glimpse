# Glimpse - Video Semantic Analyzer

A modern, AI-powered video analysis application built with Vue 3, Vite, and Tailwind CSS. Upload a video and let Gemini AI identify key moments, automatically extracting screenshots at those timestamps.

## Features

- 🎬 **Drag-and-drop video upload** - Sleek, intuitive interface
- 🤖 **AI-powered analysis** - Gemini 3.0 identifies key moments
- 📸 **Automatic screenshot extraction** - Canvas-based frame capture at specific timestamps
- 🎨 **Glassmorphism UI** - Modern, dark aesthetic with smooth animations
- ⚡ **Built with Vue 3** - Composition API with TypeScript

## Use Cases

### 🏀 Automatic Highlight Reel (Sports)
Upload raw game footage and ask Gemini to "Find all goals and fouls" - perfect for creating highlight reels from amateur sports matches.

### 📚 Lecture Slide Extractor (Education)
Upload a Zoom recording and request "Identify every slide change" - automatically extract all slides with timestamps and speaker notes.

### 🎬 Scene Scout (Film/Media)
Upload a movie clip and search semantically: "Show me explosions" or "Find wide shots with blue lighting" - instant visual search through video content.

## Tech Stack

- **Vue 3** - Progressive JavaScript framework
- **Vite** - Next-generation frontend tooling
- **Tailwind CSS** - Utility-first CSS framework
- **@google/generative-ai** - Gemini API SDK
- **TypeScript** - Type-safe development

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   
   Add your Gemini API key to `.env`:
   ```
   VITE_GEMINI_API_KEY=your_api_key_here
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## How It Works

1. **Upload** - User selects or drags a video file
2. **Load** - Video is loaded into a hidden HTML5 `<video>` element
3. **Convert** - File is converted to base64 for inline upload
4. **Analyze** - `gemini-3-flash-preview` analyzes the video and returns JSON with timestamps and summaries
5. **Capture** - For each timestamp:
   - Video seeks to the timestamp
   - Canvas captures the current frame
   - Frame is converted to a data URL
6. **Display** - Results shown in a responsive grid with screenshots and summaries

## Project Structure

```
glimpse/
├── src/
│   ├── components/
│   │   └── EventCard.vue          # Event card component
│   ├── composables/
│   │   ├── useGeminiAnalysis.ts   # Gemini API integration
│   │   └── useVideoScreenshots.ts # Screenshot extraction logic
│   ├── App.vue                     # Main application
│   ├── main.ts                     # Application entry point
│   └── style.css                   # Global styles
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## License

MIT
