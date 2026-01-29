package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// Screenshot extraction handler
func handleExtractScreenshots() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Limit upload size (100MB)
		r.Body = http.MaxBytesReader(w, r.Body, 200<<20)

		// Use 10MB memory buffer - larger uploads spill to temp files on disk
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, "File too large or invalid multipart form", http.StatusBadRequest)
			return
		}

		// Get video file
		file, _, err := r.FormFile("video")
		if err != nil {
			http.Error(w, "Error retrieving video file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Get timestamps JSON
		timestampsJSON := r.FormValue("timestamps")
		if timestampsJSON == "" {
			http.Error(w, "Missing timestamps parameter", http.StatusBadRequest)
			return
		}

		var timestamps []float64
		if err := json.Unmarshal([]byte(timestampsJSON), &timestamps); err != nil {
			http.Error(w, "Invalid timestamps JSON", http.StatusBadRequest)
			return
		}

		// Save video to temp file
		tempDir := os.TempDir()
		tempFile, err := os.CreateTemp(tempDir, "video-*.mp4")
		if err != nil {
			http.Error(w, "Error creating temporary file", http.StatusInternalServerError)
			return
		}
		tempPath := tempFile.Name()
		defer os.Remove(tempPath) // Clean up after we're done

		if _, err := io.Copy(tempFile, file); err != nil {
			tempFile.Close()
			http.Error(w, "Error saving file", http.StatusInternalServerError)
			return
		}

		// IMPORTANT: Sync and close file before FFmpeg reads it
		if err := tempFile.Sync(); err != nil {
			tempFile.Close()
			http.Error(w, "Error syncing file", http.StatusInternalServerError)
			return
		}
		tempFile.Close()

		log.Printf("Processing video: %s, extracting %d screenshots", tempPath, len(timestamps))

		// Always convert video to standard format for reliable extraction
		// This ensures fragmented MP4s (from YouTube/streaming) work correctly
		log.Printf("Converting video to standard format for reliable extraction...")
		convertedPath, err := convertEntireVideo(tempPath)
		videoToUse := tempPath
		if err != nil {
			log.Printf("Video conversion failed, trying original: %v", err)
		} else {
			videoToUse = convertedPath
			defer os.Remove(convertedPath) // Clean up converted file
			log.Printf("Video converted successfully: %s", convertedPath)
		}

		// Get video duration to validate timestamps
		duration, err := getVideoDuration(videoToUse)
		if err != nil {
			log.Printf("Warning: Could not get video duration: %v", err)
			duration = 999999 // Use a large number if we can't get duration
		} else {
			log.Printf("Video duration: %.2f seconds", duration)
		}

		// Filter out timestamps beyond video duration
		validTimestamps := make([]float64, 0, len(timestamps))
		for _, ts := range timestamps {
			if ts < duration {
				validTimestamps = append(validTimestamps, ts)
			} else {
				log.Printf("Skipping timestamp %.2fs (beyond video duration of %.2fs)", ts, duration)
			}
		}

		// Extract screenshots using FFmpeg
		screenshots := make([]string, len(timestamps))
		validIndex := 0
		for i, timestamp := range timestamps {
			// Skip if timestamp is beyond duration
			if timestamp >= duration {
				screenshots[i] = ""
				continue
			}

			screenshot, err := extractFrameDirect(videoToUse, validTimestamps[validIndex])
			validIndex++
			if err != nil {
				log.Printf("Error extracting frame at %.2fs: %v", timestamp, err)
				screenshots[i] = "" // Empty string for failed extractions
				continue
			}
			screenshots[i] = screenshot
			log.Printf("Extracted frame %d/%d at %.2fs", i+1, len(timestamps), timestamp)
		}

		// Return JSON response
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"screenshots": screenshots,
		})
	}
}

// Extract a single frame at the given timestamp using FFmpeg
func extractFrameAtTimestamp(videoPath string, timestamp float64) (string, error) {
	// Strategy 1: Try direct extraction
	screenshot, err := extractFrameDirect(videoPath, timestamp)
	if err == nil && screenshot != "" {
		return screenshot, nil
	}

	// Strategy 2: Try with conversion (for fragmented MP4s)
	log.Printf("Direct extraction failed at %.2fs, trying conversion: %v", timestamp, err)
	screenshot, err = extractFrameWithConversion(videoPath, timestamp)
	if err == nil && screenshot != "" {
		return screenshot, nil
	}

	// Strategy 3: Try extracting nearest keyframe (faster, less accurate)
	log.Printf("Conversion failed at %.2fs, trying keyframe extraction: %v", timestamp, err)
	screenshot, err = extractNearestKeyframe(videoPath, timestamp)
	if err == nil && screenshot != "" {
		return screenshot, nil
	}

	// All strategies failed
	return "", fmt.Errorf("all extraction strategies failed for timestamp %.2fs", timestamp)
}

// Try to extract frame directly
func extractFrameDirect(videoPath string, timestamp float64) (string, error) {
	cmd := exec.Command("ffmpeg",
		"-i", videoPath,
		"-ss", fmt.Sprintf("%.3f", timestamp),
		"-vframes", "1",
		"-f", "image2pipe",
		"-vcodec", "mjpeg",
		"-q:v", "2",
		"-y",
		"pipe:1",
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("ffmpeg error: %v, stderr: %s", err, stderr.String())
	}

	if stdout.Len() == 0 {
		return "", fmt.Errorf("no output from ffmpeg")
	}

	base64Image := base64.StdEncoding.EncodeToString(stdout.Bytes())
	return "data:image/jpeg;base64," + base64Image, nil
}

// Convert video to standard format first, then extract frame
func extractFrameWithConversion(videoPath string, timestamp float64) (string, error) {
	// Create temp file for converted video
	tempDir := os.TempDir()
	convertedFile, err := os.CreateTemp(tempDir, "converted-*.mp4")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %v", err)
	}
	convertedPath := convertedFile.Name()
	convertedFile.Close()
	defer os.Remove(convertedPath)

	// Convert video to standard MP4 format
	// Only convert a small segment around the timestamp to save time
	startTime := timestamp - 2
	if startTime < 0 {
		startTime = 0
	}

	convertCmd := exec.Command("ffmpeg",
		"-ss", fmt.Sprintf("%.3f", startTime),
		"-i", videoPath,
		"-t", "5", // Only convert 5 seconds
		"-c:v", "libx264",
		"-preset", "ultrafast",
		"-tune", "zerolatency", // Reduces memory by disabling lookahead
		"-threads", "1", // Single thread = less memory
		"-an", // No audio
		"-y",
		convertedPath,
	)

	var convertStderr bytes.Buffer
	convertCmd.Stderr = &convertStderr

	if err := convertCmd.Run(); err != nil {
		return "", fmt.Errorf("conversion failed: %v, stderr: %s", err, convertStderr.String())
	}

	// Now extract frame from converted video
	// Adjust timestamp relative to the segment start
	relativeTimestamp := timestamp - startTime
	if relativeTimestamp < 0 {
		relativeTimestamp = 0
	}

	return extractFrameDirect(convertedPath, relativeTimestamp)
}

// Extract nearest keyframe (fastest, least accurate, but most reliable for fragmented videos)
func extractNearestKeyframe(videoPath string, timestamp float64) (string, error) {
	// Use -skip_frame nokey to only decode keyframes, much faster and more reliable
	cmd := exec.Command("ffmpeg",
		"-skip_frame", "nokey",
		"-i", videoPath,
		"-ss", fmt.Sprintf("%.3f", timestamp),
		"-vframes", "1",
		"-f", "image2pipe",
		"-vcodec", "mjpeg",
		"-q:v", "2",
		"-y",
		"pipe:1",
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("keyframe extraction error: %v, stderr: %s", err, stderr.String())
	}

	if stdout.Len() == 0 {
		return "", fmt.Errorf("no keyframe output from ffmpeg")
	}

	base64Image := base64.StdEncoding.EncodeToString(stdout.Bytes())
	return "data:image/jpeg;base64," + base64Image, nil
}

// Convert entire video to a standard format that FFmpeg can read reliably
func convertEntireVideo(videoPath string) (string, error) {
	// Create temp file for converted video
	tempDir := os.TempDir()
	convertedFile, err := os.CreateTemp(tempDir, "full-converted-*.mp4")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %v", err)
	}
	convertedPath := convertedFile.Name()
	convertedFile.Close()

	log.Printf("Converting video to standard format: %s -> %s", videoPath, convertedPath)

	// Convert video to standard MP4 format
	// Use fast settings for speed while maintaining compatibility
	// Low-memory FFmpeg settings:
	// - ultrafast preset: minimal CPU/memory for encoding
	// - zerolatency tune: disables frame lookahead buffer
	// - threads 1: single thread reduces peak memory
	// - bufsize 0: no rate control buffer
	convertCmd := exec.Command("ffmpeg",
		"-i", videoPath,
		"-c:v", "libx264",
		"-preset", "ultrafast",
		"-tune", "zerolatency",
		"-threads", "1",
		"-crf", "28", // Higher CRF = less work, lower quality (fine for screenshots)
		"-bufsize", "0",
		"-an",
		"-y",
		convertedPath,
	)

	var convertStderr bytes.Buffer
	convertCmd.Stderr = &convertStderr

	if err := convertCmd.Run(); err != nil {
		os.Remove(convertedPath) // Clean up on failure
		return "", fmt.Errorf("conversion failed: %v, stderr: %s", err, convertStderr.String())
	}

	// Verify the converted file exists and has content
	info, err := os.Stat(convertedPath)
	if err != nil || info.Size() == 0 {
		os.Remove(convertedPath)
		return "", fmt.Errorf("converted file is empty or missing")
	}

	log.Printf("Video converted successfully: %s (%.2f MB)", convertedPath, float64(info.Size())/1024/1024)
	return convertedPath, nil
}

// Get video duration in seconds using ffprobe
func getVideoDuration(videoPath string) (float64, error) {
	cmd := exec.Command("ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		videoPath,
	)

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return 0, fmt.Errorf("ffprobe error: %v", err)
	}

	durationStr := strings.TrimSpace(stdout.String())
	duration, err := strconv.ParseFloat(durationStr, 64)
	if err != nil {
		return 0, fmt.Errorf("failed to parse duration: %v", err)
	}

	return duration, nil
}
