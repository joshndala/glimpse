import { ref } from 'vue'

export interface VideoEvent {
    timestamp_seconds: number
    title: string
    description: string
    insights?: string
    screenshot?: string
}

/**
 * Composable for extracting screenshots from video at specific timestamps
 */
export function useVideoScreenshots() {
    const videoElement = ref<HTMLVideoElement | null>(null)
    const canvasElement = ref<HTMLCanvasElement | null>(null)
    const loadingProgress = ref(0)

    /**
     * Initialize hidden video and canvas elements
     */
    const initializeElements = () => {
        if (!videoElement.value) {
            videoElement.value = document.createElement('video')
            videoElement.value.style.display = 'none'
            videoElement.value.crossOrigin = 'anonymous'
            document.body.appendChild(videoElement.value)
        }

        if (!canvasElement.value) {
            canvasElement.value = document.createElement('canvas')
            canvasElement.value.style.display = 'none'
            document.body.appendChild(canvasElement.value)
        }
    }

    /**
     * Load video file into the hidden video element
     */
    const loadVideo = (file: File): Promise<void> => {
        loadingProgress.value = 0
        return new Promise((resolve, reject) => {
            initializeElements()

            if (!videoElement.value) {
                reject(new Error('Video element not initialized'))
                return
            }

            const url = URL.createObjectURL(file)
            videoElement.value.src = url

            videoElement.value.onloadedmetadata = () => {
                loadingProgress.value = 10
                resolve()
            }

            videoElement.value.onerror = () => {
                reject(new Error('Failed to load video'))
            }
        })
    }

    /**
     * Capture screenshot at specific timestamp
     */
    const captureScreenshot = (timestamp: number): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (!videoElement.value || !canvasElement.value) {
                reject(new Error('Elements not initialized'))
                return
            }

            const video = videoElement.value
            const canvas = canvasElement.value

            // Set canvas dimensions to match video
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight

            // Add timeout protection (10 seconds)
            const timeoutId = setTimeout(() => {
                video.removeEventListener('seeked', onSeeked)
                reject(new Error(`Screenshot capture timed out at ${timestamp}s`))
            }, 10000)

            // Seek to timestamp
            video.currentTime = timestamp

            // Wait for seek to complete
            const onSeeked = () => {
                try {
                    clearTimeout(timeoutId)

                    const ctx = canvas.getContext('2d')
                    if (!ctx) {
                        reject(new Error('Could not get canvas context'))
                        return
                    }

                    // Draw current video frame to canvas
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

                    // Convert canvas to data URL
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

                    video.removeEventListener('seeked', onSeeked)
                    resolve(dataUrl)
                } catch (error) {
                    clearTimeout(timeoutId)
                    video.removeEventListener('seeked', onSeeked)
                    reject(error)
                }
            }

            video.addEventListener('seeked', onSeeked)
        })
    }

    /**
   * Process multiple events and add screenshots
   */
    const addScreenshotsToEvents = async (events: VideoEvent[]): Promise<VideoEvent[]> => {
        const eventsWithScreenshots: VideoEvent[] = []
        loadingProgress.value = 10

        for (let i = 0; i < events.length; i++) {
            const event = events[i]
            console.log(`Extracting screenshot ${i + 1}/${events.length} at ${event.timestamp_seconds}s...`)

            // Calculate progress from 10% to 100%
            const progress = 10 + Math.round(((i + 1) / events.length) * 90)
            loadingProgress.value = progress

            try {
                const screenshot = await captureScreenshot(event.timestamp_seconds)
                eventsWithScreenshots.push({
                    ...event,
                    screenshot
                })
                console.log(`✓ Screenshot ${i + 1} complete`)
            } catch (error) {
                console.error(`Failed to capture screenshot at ${event.timestamp_seconds}s:`, error)
                // Add event without screenshot
                eventsWithScreenshots.push(event)
            }
        }

        return eventsWithScreenshots
    }

    /**
     * Cleanup resources
     */
    const cleanup = () => {
        if (videoElement.value) {
            if (videoElement.value.src) {
                URL.revokeObjectURL(videoElement.value.src)
            }
            videoElement.value.remove()
            videoElement.value = null
        }

        if (canvasElement.value) {
            canvasElement.value.remove()
            canvasElement.value = null
        }
        loadingProgress.value = 0
    }

    return {
        loadVideo,
        captureScreenshot,
        addScreenshotsToEvents,
        cleanup,
        loadingProgress
    }
}
