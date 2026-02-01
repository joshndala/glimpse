# Hylite Studio - Sports Recruitment Auditor

A professional-grade sports recruitment audit platform powered by **Gemini 3.0**. Hylite Studio analyzes player case files—videos, stat sheets, reports, or any combination—to help scouts and recruiters make informed decisions with AI-powered cross-referencing and analysis.

## Features

- 🔍 **Audit Mode** - Cross-reference claims in reports against video evidence to verify player statistics.
- � **Scout Mode** - Analyze gameplay footage to evaluate player skills, potential, and performance from scratch.
- 📊 **Analyst Mode** - Review statistical reports to identify red flags, outliers, and impressive metrics.
- 📁 **Multi-File Support** - Upload multiple videos and documents (PDFs, images, Excel) in a single case file.
- 🎬 **Playlist Player** - Navigate between multiple videos with clickable timestamps that auto-switch and seek.
- 🎨 **Premium UI** - Dark-themed, glassmorphic interface built with Vue 3 and Tailwind CSS.
- ⚡ **High Performance** - Go backend handles heavy video processing efficiently.

## How It Works

Upload a player's case file and let AI determine the best analysis approach:

| Mode | Triggered When | Purpose |
|------|---------------|---------|
| 🔍 **Audit** | Videos + Reports | Cross-reference claims against video evidence |
| 👀 **Scout** | Videos only | Evaluate player from scratch |
| 📊 **Analyst** | Reports only | Summarize stats, find red flags |

The AI provides:
- **Verdict** (Claims Verified / Discrepancies Found / etc.)
- **Scout Rating** (1-10 scale for player potential)
- **Key Moments** (Timestamped highlights with video index)
- **Strengths & Weaknesses**
- **Red Flags** (Concerns or inconsistencies)

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

## Setup & Running

### Prerequisites
- Node.js (v18+)
- Go (v1.21+)
- Google Cloud API Key (with Gemini access)

### 1. Backend Setup

The backend handles video uploads and Gemini analysis.

```bash
cd backend

# Install Go dependencies
go mod download

# Create .env file in repo root (or set in environment)
echo "GEMINI_API_KEY=your_api_key_here" > ../.env
echo "ALLOWED_ORIGINS=http://localhost:5173" >> ../.env

# Run the server
go run .
```
*Server runs on port 8080 by default.*

### 2. Frontend Setup

The frontend provides the user interface for uploading and viewing reports.

```bash
# Install dependencies
npm install

# Create .env file (if not already created)
echo "VITE_API_URL=http://localhost:8080" > .env

# Run the development server
npm run dev
```

## Usage

1. **Upload Files**: Drag and drop videos, PDFs, screenshots, or stat sheets into the Case File upload zone.
2. **Automatic Mode Detection**: The system automatically selects Audit/Scout/Analyst mode based on what you upload.
3. **AI Analysis**: Gemini analyzes the materials and generates a comprehensive report.
4. **Review Results**: Navigate the playlist, click timestamps to jump to key moments, and review strengths/weaknesses.

## API Endpoints

### `POST /api/audit`
Main endpoint for case file analysis.

**Request:**
- `videos[]` - Array of video files (optional)
- `reports[]` - Array of report files: PDFs, images, Excel (optional)

**Response:**
```json
{
  "mode": "audit|scout|analyst",
  "scout_rating": 8.5,
  "verdict": "Claims Verified",
  "summary": "...",
  "key_moments": [
    {
      "video_index": 0,
      "timestamp_seconds": 45,
      "title": "...",
      "description": "..."
    }
  ],
  "red_flags": ["..."],
  "strengths": ["..."],
  "weaknesses": ["..."],
  "player_info": {
    "jersey_number": "23",
    "position": "Forward",
    "team": "..."
  }
}
```

## Project Structure

```
hylite-studio/
├── backend/                # Go Backend
│   ├── main.go            # Server & Gemini integration
│   └── go.mod             # Go dependencies
├── src/                    # Vue 3 Frontend
│   ├── composables/       # Logic (API calls, state)
│   │   └── useGeminiAnalysis.ts
│   ├── App.vue            # Main UI
│   └── style.css          # Tailwind directives
├── index.html
└── package.json
```

## Color Scheme

- **Background**: `#0D1B2A` (Midnight Navy)
- **Surface**: `#1B263B` (Dark Blue-Gray)
- **Text**: `#F0F4F8` (Off-White)
- **Brand Accent**: `#1878E5` (Blue)
- **Success**: `#00C46A` (Green)
- **Warning**: `#FF6B00` (Orange)

## License

MIT
