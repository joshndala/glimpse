import { ref } from 'vue'

// Types for the new audit response
export interface KeyMoment {
    video_index: number
    timestamp_seconds: number
    title: string
    description: string
    screenshot?: string // Added by frontend after extraction
}

export interface PlayerInfo {
    jersey_number?: string
    position?: string
    team?: string
}

export interface AuditReport {
    mode: 'audit' | 'scout' | 'analyst'
    scout_rating?: number
    verdict: string
    summary: string
    key_moments: KeyMoment[]
    red_flags?: string[]
    strengths?: string[]
    weaknesses?: string[]
    player_info?: PlayerInfo
}

// Legacy types for backwards compatibility
export interface KeyHighlight {
    timestamp_seconds: number
    title: string
    description: string
    screenshot?: string
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
     * Audit a case file with videos and/or reports
     * Returns a structured audit report
     */
    const auditCaseFile = async (videos: File[], reports: File[]): Promise<AuditReport> => {
        isAnalyzing.value = true
        error.value = null
        uploadProgress.value = 0

        try {
            const formData = new FormData()

            // Add videos
            for (const video of videos) {
                formData.append('videos[]', video)
            }

            // Add reports
            for (const report of reports) {
                formData.append('reports[]', report)
            }

            // Progress simulation
            const progressInterval = setInterval(() => {
                if (uploadProgress.value < 90) {
                    uploadProgress.value += 5
                }
            }, 1000)

            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'
            const response = await fetch(`${apiUrl}/api/audit`, {
                method: 'POST',
                body: formData,
            })

            clearInterval(progressInterval)
            uploadProgress.value = 100

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Audit failed: ${errorText}`)
            }

            const report: AuditReport = await response.json()

            // Validate response structure
            console.log('Received audit report from backend:', report)

            const missingFields: string[] = []
            if (!report.mode) missingFields.push('mode')
            if (!report.verdict) missingFields.push('verdict')
            if (!report.summary) missingFields.push('summary')

            if (missingFields.length > 0) {
                console.error('Invalid response structure:', report)
                throw new Error(`Invalid response from server: missing fields: ${missingFields.join(', ')}`)
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
        auditCaseFile,
        isAnalyzing,
        error,
        uploadProgress
    }
}
