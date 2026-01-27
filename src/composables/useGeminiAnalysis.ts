import { ref } from 'vue'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VideoEvent } from './useVideoScreenshots'

export function useGeminiAnalysis() {
    const isAnalyzing = ref(false)
    const error = ref<string | null>(null)
    const uploadProgress = ref(0)

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY

    if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY is not set in environment variables')
    }

    const genAI = new GoogleGenerativeAI(apiKey)

    /**
     * Convert File to base64 for inline upload
     */
    const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1]
                resolve({
                    inlineData: {
                        data: base64,
                        mimeType: file.type
                    }
                })
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    /**
     * Analyze video and extract key moments
     */
    const analyzeVideo = async (file: File, customPrompt?: string): Promise<VideoEvent[]> => {
        isAnalyzing.value = true
        error.value = null

        try {
            uploadProgress.value = 25

            // Convert file to base64
            const videoPart = await fileToGenerativePart(file)

            uploadProgress.value = 50

            // Build system instruction based on whether custom prompt is provided
            const systemInstruction = customPrompt
                ? `You are a professional video analyst. The user wants you to: ${customPrompt}

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
- description should provide rich detail about the scene, actions, and context
- insights can include technical observations, significance, or patterns
- Find all relevant moments based on the user's request`
                : `You are a professional video analyst. Provide a comprehensive analysis of this video.

Return your response as a valid JSON array containing objects with the following structure:
[
  {
    "timestamp_seconds": <number>,
    "title": "<concise title for this moment>",
    "description": "<detailed 2-3 sentence description of what's happening>",
    "insights": "<analytical insight, significance, or pattern observed>"
  }
]

Important:
- Return ONLY the JSON array, no additional text
- timestamp_seconds must be a number (not a string)
- title should be brief and descriptive (max 5-7 words)
- description should provide rich detail about the scene, actions, context, and visual elements
- insights should offer analytical value: technical observations, thematic significance, or notable patterns
- Identify 5-10 significant moments throughout the video
- Distribute timestamps to capture the full narrative arc`

            // Create model with system instruction
            const model = genAI.getGenerativeModel({
                model: 'gemini-3-flash-preview',
                systemInstruction
            })

            uploadProgress.value = 75

            // Build user prompt
            const userPrompt = customPrompt
                ? `Analyze this video and find moments matching this request: "${customPrompt}". Return the results as a JSON array.`
                : 'Analyze this video and identify the key moments or events. Return the results as a JSON array.'

            // Generate content
            const result = await model.generateContent([
                videoPart,
                {
                    text: userPrompt
                }
            ])

            uploadProgress.value = 100

            const response = result.response.text()

            // Parse JSON response with robust extraction
            let events: VideoEvent[]
            try {
                // First, try to remove markdown code blocks
                let jsonText = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

                // If that doesn't work, try to extract JSON array using regex
                if (!jsonText.startsWith('[')) {
                    const jsonMatch = jsonText.match(/\[[\s\S]*\]/)
                    if (jsonMatch) {
                        jsonText = jsonMatch[0]
                    }
                }

                events = JSON.parse(jsonText)
            } catch (parseError) {
                console.error('Raw Gemini response:', response)
                throw new Error(`Failed to parse Gemini response: ${parseError}`)
            }

            // Validate response structure
            if (!Array.isArray(events)) {
                throw new Error('Gemini response is not an array')
            }

            for (const event of events) {
                if (typeof event.timestamp_seconds !== 'number' ||
                    typeof event.title !== 'string' ||
                    typeof event.description !== 'string') {
                    throw new Error('Invalid event structure in Gemini response')
                }
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
