# Hylite Studio - AI Sports Performance Analyst

A professional-grade sports video analysis platform powered by **Gemini 3.0**. Hylite Studio automatically analyzes gameplay footage to identify players, generate performance reports, and extract high-quality highlight screenshots using a robust **Go** backend with **FFmpeg**.

## Features

- 🏀 **AI Player Identification** - Automatically identifies key players by jersey number and position.
- 📊 **Performance Reports** - Generates professional-grade summaries and performance ratings (1-10).
- 🎬 **Smart Highlight Extraction** - Uses FFmpeg to extract high-quality screenshots for key moments.
- ⏱️ **Match Timeline** - diverse breakdown of every notable event in the video.
- 🎨 **Premium UI** - Dark-themed, glassmorphic interface built with Vue 3 and Tailwind CSS.
- ⚡ **High Performance** - Go backend handles heavy video processing efficiently.

## Use Cases

### ⚽ Player Recruitment
Upload raw match footage to generate instant scouting reports with key highlights for recruiters.

### 🎥 Content Creation
Quickly turn full game recordings into analyzed clips and summaries for social media or broadcast.

### 📈 Coaching Analysis
Review player performance with an automated timeline of every play, foul, and goal.

## Tech Stack

### Frontend
- **Vue 3** (Composition API)
- **Vite** (Build tool)
- **Tailwind CSS** (Styling)
- **TypeScript**

### Backend
- **Go** (Golang)
- **Chi** (Router)
- **GenAI Go SDK** (Gemini 3.0 Integration)
- **FFmpeg** (Video Processing & Screenshot Extraction)

## Setup & Running

### Prerequisites
- Node.js (v18+)
- Go (v1.21+)
- FFmpeg installed and available in system PATH
- Google Cloud API Key (with Gemini access)

### 1. Backend Setup

The backend handles video uploads, Gemini analysis, and FFmpeg processing.

```bash
cd backend

# Install Go dependencies
go mod download

# Create .env file (or set in environment)
echo "GEMINI_API_KEY=your_api_key_here" > .env
echo "ALLOWED_ORIGINS=http://localhost:5173" >> .env

# Run the server
go run main.go
```
*Server runs on port 8080 by default.*

### 2. Frontend Setup

The frontend provides the user interface for uploading and viewing reports.

```bash
# Install dependencies
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:8080" > .env

# Run the development server
npm run dev
```

## How It Works

1. **Upload**: User drags & drops a sports video (up to 200MB).
2. **Analysis**: The Go backend uploads the video to **Gemini 3.0**, which acts as a professional sports analyst to generate a JSON report.
3. **Extraction**: The backend uses **FFmpeg** to extract high-quality formatting screenshots at the exact timestamps identified by AI.
4. **Presentation**: Results are displayed in a rich, interactive dashboard with player stats, narrative summary, and visual highlights.

## Project Structure

```
hylite-studio/
├── backend/                # Go Backend
│   ├── main.go            # Server & Gemini integration
│   ├── screenshots.go     # FFmpeg screenshot extraction logic
│   └── go.mod             # Go dependencies
├── src/                    # Vue 3 Frontend
│   ├── composables/       # Logic (API calls, state)
│   ├── App.vue            # Main UI
│   └── style.css          # Tailwind directives
├── index.html
└── package.json
```

## License

MIT
