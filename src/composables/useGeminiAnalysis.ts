import { ref } from 'vue'
import type { VideoEvent } from './useVideoScreenshots'

export function useGeminiAnalysis() {
    const isAnalyzing = ref(false)
    const error = ref<string | null>(null)
    const uploadProgress = ref(0)

    /**
     * Analyze video by sending it to the Go backend
     */
    const analyzeVideo = async (file: File, customPrompt?: string): Promise<VideoEvent[]> => {
        isAnalyzing.value = true
        error.value = null
        uploadProgress.value = 0

        try {
            const formData = new FormData()
            formData.append('video', file)
            if (customPrompt) {
                formData.append('prompt', customPrompt)
            }

            // Mock progress - since fetch doesn't support upload progress out of the box easily without XHR
            // We'll just simulate it or set it to "uploading"
            const progressInterval = setInterval(() => {
                if (uploadProgress.value < 90) {
                    uploadProgress.value += 10
                }
            }, 500)

            const response = await fetch('http://localhost:8080/upload', {
                method: 'POST',
                body: formData,
            })

            clearInterval(progressInterval)
            uploadProgress.value = 100

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Analysis failed: ${errorText}`)
            }

            const events: VideoEvent[] = await response.json()

            // Validate response structure (backend should ensure this, but double check)
            if (!Array.isArray(events)) {
                throw new Error('Invalid response from server: expected an array')
            }

            return events

        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Unknown error occurred'
            throw err
        } finally {
            isAnalyzing.value = false
        }
    }

    return {
        analyzeVideo,
        isAnalyzing,
        error,
        uploadProgress
    }
}
