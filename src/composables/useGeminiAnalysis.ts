import { ref } from 'vue'

// New report-style types
export interface PlayerInfo {
    jersey_number: string
    position: string
    team: string
}

export interface KeyHighlight {
    timestamp_seconds: number
    title: string
    description: string
    screenshot?: string // Added by frontend after extraction
}

export interface TimelineMoment {
    timestamp_seconds: number
    moment: string
}

export interface PerformanceReport {
    player_info: PlayerInfo
    summary: string
    key_highlights: KeyHighlight[]
    timeline: TimelineMoment[]
    performance_rating: string
}

export function useGeminiAnalysis() {
    const isAnalyzing = ref(false)
    const error = ref<string | null>(null)
    const uploadProgress = ref(0)

    /**
     * Analyze video by sending it to the Go backend
     * Returns a structured performance report
     */
    const analyzeVideo = async (file: File, customPrompt?: string): Promise<PerformanceReport> => {
        isAnalyzing.value = true
        error.value = null
        uploadProgress.value = 0

        try {
            const formData = new FormData()
            formData.append('video', file)
            if (customPrompt) {
                formData.append('prompt', customPrompt)
            }

            // Progress simulation
            const progressInterval = setInterval(() => {
                if (uploadProgress.value < 90) {
                    uploadProgress.value += 10
                }
            }, 500)

            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'
            const response = await fetch(`${apiUrl}/upload`, {
                method: 'POST',
                body: formData,
            })

            clearInterval(progressInterval)
            uploadProgress.value = 100

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Analysis failed: ${errorText}`)
            }

            const report: PerformanceReport = await response.json()

            // Validate response structure
            if (!report.player_info || !report.summary || !report.key_highlights) {
                throw new Error('Invalid response from server: missing required fields')
            }

            return report

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
