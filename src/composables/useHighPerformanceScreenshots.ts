import { ref } from 'vue'
import type { KeyHighlight } from './useGeminiAnalysis'

export function useHighPerformanceScreenshots() {
    const isProcessing = ref(false)
    const progress = ref(0)
    const error = ref<string | null>(null)

    /**
     * Extract screenshots for key highlights using backend FFmpeg API
     * Only extracts 3-5 screenshots for the key highlights
     */
    const extractScreenshots = async (file: File, highlights: KeyHighlight[]): Promise<KeyHighlight[]> => {
        isProcessing.value = true
        progress.value = 0
        error.value = null

        try {
            // Extract timestamps from key highlights only
            const timestamps = highlights.map(h => h.timestamp_seconds)

            // Create form data
            const formData = new FormData()
            formData.append('video', file)
            formData.append('timestamps', JSON.stringify(timestamps))

            // Get backend URL from environment or use default
            const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'

            // Upload to backend
            const response = await fetch(`${backendUrl}/extract-screenshots`, {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Server error: ${errorText}`)
            }

            const data = await response.json()
            const screenshots: string[] = data.screenshots

            // Map screenshots back to highlights
            const highlightsWithScreenshots = highlights.map((highlight, index) => ({
                ...highlight,
                screenshot: screenshots[index] || undefined
            }))

            progress.value = 100
            return highlightsWithScreenshots

        } catch (e: any) {
            error.value = e.message || 'Failed to extract screenshots'
            throw e
        } finally {
            isProcessing.value = false
        }
    }

    return {
        extractScreenshots,
        isProcessing,
        progress,
        error
    }
}
