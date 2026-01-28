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
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "https://*.render.com"}, // Adjust for production
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Post("/upload", handleUpload(apiKey))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server listening on port %s\n", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func handleUpload(apiKey string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Limit upload size (e.g., 100MB)
		r.Body = http.MaxBytesReader(w, r.Body, 100<<20)

		if err := r.ParseMultipartForm(100 << 20); err != nil {
			http.Error(w, "File too large or invalid multipart form", http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("video")
		if err != nil {
			http.Error(w, "Error retrieving video file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		customPrompt := r.FormValue("prompt")

		// Create a temporary file to store the upload
		tempDir := os.TempDir()
		tempFile, err := os.CreateTemp(tempDir, "upload-*.mp4")
		if err != nil {
			http.Error(w, "Error creating temporary file", http.StatusInternalServerError)
			return
		}
		defer os.Remove(tempFile.Name()) // Clean up
		defer tempFile.Close()

		// Copy uploaded file to temp file
		if _, err := io.Copy(tempFile, file); err != nil {
			http.Error(w, "Error saving file", http.StatusInternalServerError)
			return
		}

		// Rewind the file properly so it can be read again
		if _, err := tempFile.Seek(0, 0); err != nil {
			http.Error(w, "Error rewinding file", http.StatusInternalServerError)
			return
		}

		// Process with Gemini
		ctx := context.Background()
		client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
		if err != nil {
			http.Error(w, "Error creating Gemini client", http.StatusInternalServerError)
			return
		}
		defer client.Close()

		// Upload file to Gemini
		uploadFile, err := client.UploadFile(ctx, "", tempFile, &genai.UploadFileOptions{
			DisplayName: header.Filename,
		})
		if err != nil {
			log.Printf("Error uploading to Gemini: %v", err)
			http.Error(w, fmt.Sprintf("Error uploading to Gemini: %v", err), http.StatusInternalServerError)
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
			http.Error(w, fmt.Sprintf("File processing failed. State: %s", uploadFile.State), http.StatusInternalServerError)
			return
		}

		// Generate content
		model := client.GenerativeModel("gemini-3-flash-preview")
		model.ResponseMIMEType = "application/json"

		systemPrompt := `You are a professional video analyst.
Return your response as a valid JSON array containing objects with the following structure:
[
  {
    "timestamp_seconds": <number>,
    "title": "<concise title for this moment>",
    "description": "<detailed 2-3 sentence description of what's happening>",
    "insights": "<optional analytical insight or context>"
  }
]
Important:
- Return ONLY the JSON array, no additional text
- timestamp_seconds must be a number (not a string)
- title should be brief and descriptive (max 5-7 words)
- description should provide rich detail about the scene, actions, and context`

		model.SystemInstruction = genai.NewUserContent(genai.Text(systemPrompt))

		userPromptText := "Analyze this video and identify key moments."
		if customPrompt != "" {
			userPromptText = fmt.Sprintf("Analyze this video and find moments matching this request: '%s'. Return the results as a JSON array.", customPrompt)
		}

		resp, err := model.GenerateContent(ctx, genai.Text(userPromptText), genai.FileData{URI: uploadFile.URI})
		if err != nil {
			log.Printf("Error generating content: %v", err)
			http.Error(w, fmt.Sprintf("Error generating content: %v", err), http.StatusInternalServerError)
			return
		}

		// Clean up file on Gemini side (optional but recommended)
		// go func() {
		// 	 client.DeleteFile(ctx, uploadFile.Name)
		// }()
		// For now, let's leave it or implement a cleanup later.
		// Actually, let's delete it to be clean.
		defer client.DeleteFile(ctx, uploadFile.Name)

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

		// Basic cleaning if needed (sometimes model adds code fences despite MIME type)
		jsonResponse = strings.TrimSpace(jsonResponse)
		jsonResponse = strings.TrimPrefix(jsonResponse, "```json")
		jsonResponse = strings.TrimPrefix(jsonResponse, "```")
		jsonResponse = strings.TrimSuffix(jsonResponse, "```")

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(jsonResponse))
	}
}
