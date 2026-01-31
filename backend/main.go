package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
)

// AuditResponse represents the structured output from the audit
type AuditResponse struct {
	Mode        string      `json:"mode"`
	ScoutRating float64     `json:"scout_rating,omitempty"`
	Verdict     string      `json:"verdict"`
	Summary     string      `json:"summary"`
	KeyMoments  []KeyMoment `json:"key_moments"`
	RedFlags    []string    `json:"red_flags,omitempty"`
	Strengths   []string    `json:"strengths,omitempty"`
	Weaknesses  []string    `json:"weaknesses,omitempty"`
	PlayerInfo  *PlayerInfo `json:"player_info,omitempty"`
}

type KeyMoment struct {
	VideoIndex       int     `json:"video_index"`
	TimestampSeconds float64 `json:"timestamp_seconds"`
	Title            string  `json:"title"`
	Description      string  `json:"description"`
}

type PlayerInfo struct {
	JerseyNumber string `json:"jersey_number,omitempty"`
	Position     string `json:"position,omitempty"`
	Team         string `json:"team,omitempty"`
}

func main() {
	// Try loading .env from parent directory (repo root) or current directory
	_ = godotenv.Load("../.env")
	_ = godotenv.Load() // Also try local .env just in case

	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Fatal("GEMINI_API_KEY environment variable is required")
	}

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS configuration
	allowedOrigins := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",")
	if len(allowedOrigins) == 0 || (len(allowedOrigins) == 1 && allowedOrigins[0] == "") {
		allowedOrigins = []string{"http://localhost:5173"} // Default for local dev
	}

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check endpoint
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// New audit endpoint
	r.Post("/api/audit", handleAudit(apiKey))

	// Keep screenshot extraction for now
	r.Post("/extract-screenshots", handleExtractScreenshots())

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server listening on port %s\n", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func handleAudit(apiKey string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Limit upload size (200MB)
		r.Body = http.MaxBytesReader(w, r.Body, 200<<20)

		// Use 10MB memory buffer - larger uploads spill to temp files on disk
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, "File too large or invalid multipart form", http.StatusBadRequest)
			return
		}

		// Get video files (optional)
		videoFiles := r.MultipartForm.File["videos[]"]
		// Get report files (optional)
		reportFiles := r.MultipartForm.File["reports[]"]

		// Validate: at least one type of file must be provided
		if len(videoFiles) == 0 && len(reportFiles) == 0 {
			http.Error(w, "At least one video or report file is required", http.StatusBadRequest)
			return
		}

		// Determine mode based on what's provided
		var mode string
		if len(videoFiles) > 0 && len(reportFiles) > 0 {
			mode = "audit"
		} else if len(videoFiles) > 0 {
			mode = "scout"
		} else {
			mode = "analyst"
		}

		log.Printf("Audit mode: %s, Videos: %d, Reports: %d", mode, len(videoFiles), len(reportFiles))

		// Process with Gemini
		ctx := context.Background()
		client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
		if err != nil {
			http.Error(w, "Error creating Gemini client", http.StatusInternalServerError)
			return
		}
		defer client.Close()

		// Build prompt parts
		var parts []genai.Part

		// Handle videos - upload to Gemini Files API
		var uploadedFiles []*genai.File
		for i, fileHeader := range videoFiles {
			log.Printf("Processing video %d: %s", i+1, fileHeader.Filename)

			file, err := fileHeader.Open()
			if err != nil {
				http.Error(w, fmt.Sprintf("Error opening video %d", i+1), http.StatusBadRequest)
				return
			}

			// Save to temp file
			tempFile, err := os.CreateTemp("", "video-*.mp4")
			if err != nil {
				file.Close()
				http.Error(w, "Error creating temp file", http.StatusInternalServerError)
				return
			}

			if _, err := io.Copy(tempFile, file); err != nil {
				file.Close()
				tempFile.Close()
				os.Remove(tempFile.Name())
				http.Error(w, "Error saving video", http.StatusInternalServerError)
				return
			}
			file.Close()
			tempFile.Close()

			// Reopen for upload
			tempFile, err = os.Open(tempFile.Name())
			if err != nil {
				os.Remove(tempFile.Name())
				http.Error(w, "Error reopening temp file", http.StatusInternalServerError)
				return
			}

			// Upload to Gemini
			uploadFile, err := client.UploadFile(ctx, "", tempFile, &genai.UploadFileOptions{
				DisplayName: fmt.Sprintf("Video %d: %s", i+1, fileHeader.Filename),
			})
			tempFile.Close()
			os.Remove(tempFile.Name())

			if err != nil {
				log.Printf("Error uploading video to Gemini: %v", err)
				http.Error(w, fmt.Sprintf("Error uploading video %d to Gemini", i+1), http.StatusInternalServerError)
				return
			}

			// Wait for processing
			for uploadFile.State == genai.FileStateProcessing {
				time.Sleep(2 * time.Second)
				uploadFile, err = client.GetFile(ctx, uploadFile.Name)
				if err != nil {
					log.Printf("Error checking file state: %v", err)
					http.Error(w, "Error checking file state", http.StatusInternalServerError)
					return
				}
			}

			if uploadFile.State != genai.FileStateActive {
				log.Printf("File processing failed. State: %s", uploadFile.State)
				http.Error(w, fmt.Sprintf("Video %d processing failed", i+1), http.StatusInternalServerError)
				return
			}

			uploadedFiles = append(uploadedFiles, uploadFile)
			parts = append(parts, genai.FileData{URI: uploadFile.URI})
			log.Printf("Video %d uploaded successfully: %s", i+1, uploadFile.Name)
		}

		// Clean up uploaded files when done
		defer func() {
			for _, uf := range uploadedFiles {
				client.DeleteFile(ctx, uf.Name)
			}
		}()

		// Handle reports - add as inline Blob data
		for i, fileHeader := range reportFiles {
			log.Printf("Processing report %d: %s", i+1, fileHeader.Filename)

			file, err := fileHeader.Open()
			if err != nil {
				http.Error(w, fmt.Sprintf("Error opening report %d", i+1), http.StatusBadRequest)
				return
			}

			data, err := io.ReadAll(file)
			file.Close()
			if err != nil {
				http.Error(w, fmt.Sprintf("Error reading report %d", i+1), http.StatusInternalServerError)
				return
			}

			// Determine MIME type
			mimeType := fileHeader.Header.Get("Content-Type")
			if mimeType == "" {
				// Fallback based on extension
				filename := strings.ToLower(fileHeader.Filename)
				switch {
				case strings.HasSuffix(filename, ".pdf"):
					mimeType = "application/pdf"
				case strings.HasSuffix(filename, ".png"):
					mimeType = "image/png"
				case strings.HasSuffix(filename, ".jpg"), strings.HasSuffix(filename, ".jpeg"):
					mimeType = "image/jpeg"
				case strings.HasSuffix(filename, ".xlsx"):
					mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				case strings.HasSuffix(filename, ".xls"):
					mimeType = "application/vnd.ms-excel"
				default:
					mimeType = "application/octet-stream"
				}
			}

			parts = append(parts, genai.Blob{
				MIMEType: mimeType,
				Data:     data,
			})
			log.Printf("Report %d added: %s (%s)", i+1, fileHeader.Filename, mimeType)
		}

		// Build dynamic system prompt based on mode
		systemPrompt := buildSystemPrompt(mode, len(videoFiles), len(reportFiles))

		// Generate content
		model := client.GenerativeModel("gemini-3-pro-preview")
		model.ResponseMIMEType = "application/json"
		model.SystemInstruction = genai.NewUserContent(genai.Text(systemPrompt))

		// Add the analysis instruction as part of the prompt
		userPrompt := buildUserPrompt(mode, len(videoFiles), len(reportFiles))
		parts = append(parts, genai.Text(userPrompt))

		resp, err := model.GenerateContent(ctx, parts...)
		if err != nil {
			log.Printf("Error generating content: %v", err)
			http.Error(w, fmt.Sprintf("Error generating content: %v", err), http.StatusInternalServerError)
			return
		}

		if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
			http.Error(w, "No content generated", http.StatusInternalServerError)
			return
		}

		var jsonResponse string
		for _, part := range resp.Candidates[0].Content.Parts {
			if txt, ok := part.(genai.Text); ok {
				jsonResponse += string(txt)
			}
		}

		// Clean up response
		jsonResponse = strings.TrimSpace(jsonResponse)
		jsonResponse = strings.TrimPrefix(jsonResponse, "```json")
		jsonResponse = strings.TrimPrefix(jsonResponse, "```")
		jsonResponse = strings.TrimSuffix(jsonResponse, "```")

		log.Printf("Sending JSON response (first 500 chars): %s", jsonResponse[:min(500, len(jsonResponse))])

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(jsonResponse))
	}
}

func buildSystemPrompt(mode string, videoCount, reportCount int) string {
	basePrompt := `You are a professional sports recruitment auditor and analyst. Your task is to provide a comprehensive evaluation based on the provided materials.

IMPORTANT: Return your response as a valid JSON object with this structure:
{
  "mode": "%s",
  "scout_rating": <number from 1-10, only for scout/audit modes>,
  "verdict": "<one-line verdict summarizing your conclusion>",
  "summary": "<2-3 paragraph detailed analysis>",
  "key_moments": [
    {
      "video_index": <0-based index of which video this moment is from>,
      "timestamp_seconds": <number>,
      "title": "<brief title>",
      "description": "<1-2 sentence description>"
    }
  ],
  "red_flags": ["<potential concerns or discrepancies>"],
  "strengths": ["<identified strengths>"],
  "weaknesses": ["<identified weaknesses>"],
  "player_info": {
    "jersey_number": "<if visible>",
    "position": "<detected position>",
    "team": "<team name if visible>"
  }
}

Guidelines:
- All timestamp_seconds must be numbers (not strings)
- video_index is 0-based (first video = 0, second video = 1, etc.)
- Return ONLY the JSON object, no additional text
`

	var modeInstructions string

	switch mode {
	case "audit":
		modeInstructions = fmt.Sprintf(`
MODE: AUDIT (Cross-referencing %d videos with %d reports)

Your PRIMARY task is to:
1. Compare the claims and statistics in the reports against what you observe in the videos
2. Verify if the reported performance metrics match the video evidence
3. Identify any discrepancies or exaggerations in the reports
4. Note if the videos support or contradict the documented claims

Verdict should indicate: "Claims Verified", "Minor Discrepancies", "Significant Discrepancies", or "Unable to Verify"
`, videoCount, reportCount)

	case "scout":
		modeInstructions = fmt.Sprintf(`
MODE: SCOUT (Analyzing %d videos from scratch)

Your PRIMARY task is to:
1. Identify the main player being showcased in the footage
2. Evaluate their technical skills, athleticism, and game intelligence
3. Assess their potential for recruitment
4. Provide an unbiased scout_rating from 1-10

Focus on: ball control, decision-making, positioning, physical attributes, consistency, and standout moments.
`, videoCount)

	case "analyst":
		modeInstructions = fmt.Sprintf(`
MODE: ANALYST (Analyzing %d reports/documents)

Your PRIMARY task is to:
1. Summarize the key statistics and claims in the documents
2. Identify any outstanding outliers (both positive and concerning)
3. Look for red flags: inconsistencies, unrealistic numbers, missing context
4. Highlight impressive metrics that stand out

Note: Without video evidence, focus on statistical analysis and document verification.
key_moments array should be empty since there are no videos.
`, reportCount)
	}

	return fmt.Sprintf(basePrompt, mode) + modeInstructions
}

func buildUserPrompt(mode string, videoCount, reportCount int) string {
	switch mode {
	case "audit":
		return fmt.Sprintf("I'm evaluating a player for potential recruitment. I've provided %d video(s) of their gameplay and %d report(s)/documents with their statistics and claims. Please cross-reference the video evidence with the documented claims and provide your audit assessment.", videoCount, reportCount)
	case "scout":
		return fmt.Sprintf("I'm scouting a player for potential recruitment. Please analyze these %d video(s) and provide a comprehensive evaluation of their skills, potential, and any concerns.", videoCount)
	case "analyst":
		return fmt.Sprintf("I'm reviewing a player's recruitment materials. Please analyze these %d document(s)/report(s) and summarize the key statistics, identify any red flags or impressive outliers.", reportCount)
	default:
		return "Please analyze the provided materials."
	}
}
