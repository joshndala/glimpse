import { ref } from 'vue'
// @ts-ignore
import * as MP4Box from 'mp4box'

export interface VideoEvent {
    timestamp_seconds: number
    title: string
    description: string
    insights?: string
    screenshot?: string
}

export function useHighPerformanceScreenshots() {
    const isProcessing = ref(false)
    const progress = ref(0)
    const error = ref<string | null>(null)

    /**
     * Extract precise screenshots using WebCodecs API
     */
    const extractScreenshots = async (file: File, events: VideoEvent[]): Promise<VideoEvent[]> => {
        isProcessing.value = true
        progress.value = 0
        error.value = null

        const mp4boxfile = MP4Box.createFile()
        let videoDecoder: VideoDecoder | null = null
        // Removed shared canvas

        return new Promise((resolve, reject) => {
            const results: { [key: number]: string } = {}
            let pendingFrames = events.length
            let videoTrack: any = null
            const allSamples: any[] = []
            let isFinished = false

            // Safety timeout: unexpected hangs shouldn't freeze the UI forever
            const timeoutId = setTimeout(() => {
                if (!isFinished) {
                    console.warn('Screenshot extraction timed out, finishing with partial results.')
                    finish()
                }
            }, 30000) // 30s timeout

            // Define finish function once
            const finish = () => {
                if (isFinished) return
                isFinished = true
                clearTimeout(timeoutId)

                // cleanup
                if (videoDecoder && videoDecoder.state !== 'closed') {
                    videoDecoder.close()
                }

                // Map results back to events
                const finalizedEvents = events.map(e => ({
                    ...e,
                    screenshot: results[e.timestamp_seconds]
                }))

                isProcessing.value = false
                resolve(finalizedEvents)
            }

            let hasReady = false

            mp4boxfile.onError = (e: any) => {
                console.error('MP4Box error:', e)
                // If we have some samples, try to proceed!
                if (hasReady && allSamples.length > 0) {
                    console.warn('MP4Box failed but we have samples, attempting to process partial file.')
                    mp4boxfile.flush()
                    processAllSamples()
                } else {
                    error.value = `MP4Box error: ${e}`
                    reject(e)
                }
            }

            mp4boxfile.onReady = (info: any) => {
                hasReady = true
                videoTrack = info.videoTracks[0]
                // ... (rest of onReady logic)

                // "info.videoTracks[0]" is a simplified object. We need the full track from the ISO file structure
                // to access the deep boxes like avcC/hvcC in stsd.
                const trackId = videoTrack.id
                // @ts-ignore
                const fullTrack = mp4boxfile.moov.traks.find((t: any) => t.tkhd.track_id === trackId)

                console.log('Full Track found:', !!fullTrack)

                const description = toDesc(fullTrack || videoTrack)


                console.log('Video Track Info:', {
                    codec: videoTrack.codec,
                    width: videoTrack.video.width,
                    height: videoTrack.video.height,
                    hasDescription: !!description
                })

                if (!description && (videoTrack.codec.startsWith('avc1') || videoTrack.codec.startsWith('hvc1'))) {
                    const msg = `Failed to extract decoder description for codec ${videoTrack.codec}`
                    error.value = msg
                    reject(new Error(msg))
                    return
                }

                // Initialize VideoDecoder
                videoDecoder = new VideoDecoder({
                    output: (frame) => {
                        if (isFinished) { frame.close(); return }

                        const frameTimeSeconds = frame.timestamp / 1_000_000

                        for (const event of events) {
                            if (Math.abs(frameTimeSeconds - event.timestamp_seconds) < 0.1) {
                                if (!results[event.timestamp_seconds]) {
                                    // Render to NEW canvas to avoid races
                                    const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight)
                                    const ctx = canvas.getContext('2d')

                                    if (ctx) {
                                        ctx.drawImage(frame, 0, 0)
                                        canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }).then(blob => {
                                            const reader = new FileReader()
                                            reader.onloadend = () => {
                                                if (!results[event.timestamp_seconds]) {
                                                    results[event.timestamp_seconds] = reader.result as string
                                                    pendingFrames--
                                                    progress.value = Math.round(((events.length - pendingFrames) / events.length) * 100)

                                                    if (pendingFrames <= 0) {
                                                        finish()
                                                    }
                                                }
                                            }
                                            reader.readAsDataURL(blob)
                                        })
                                    }
                                }
                            }
                        }
                        frame.close()
                    },
                    error: (e) => {
                        console.error('VideoDecoder error:', e)
                        // Don't reject, just continue.
                    }
                })

                videoDecoder.configure({
                    codec: videoTrack.codec,
                    codedWidth: videoTrack.video.width,
                    codedHeight: videoTrack.video.height,
                    description: description
                })

                mp4boxfile.setExtractionOptions(videoTrack.id, 'video', { nbSamples: 10000 }) // Extract all samples
                mp4boxfile.start()
            }

            mp4boxfile.onSamples = (_id: number, _user: any, samples: any[]) => {
                allSamples.push(...samples)
            }

            const processAllSamples = () => {
                const samples = allSamples
                // Determine which samples we actually need to decode.
                // For each target timestamp, find the sample.
                // Then find the previous keyframe (sync sample).
                // Feed samples from keyframe -> target sample into decoder.

                // Optimized approach: Sort samples by time.
                // Identify ranges of samples needed.

                const framesToDecode = new Set<number>()

                for (const event of events) {
                    // Find sample corresponding to timestamp
                    // Timescale is usually track.timescale (e.g. 30000 or 90000)
                    // Sample cts/dts are in timescale units.
                    const targetTime = event.timestamp_seconds * videoTrack.timescale

                    // Simple search for nearest sample
                    let nearestSampleIndex = -1
                    let minDiff = Infinity

                    for (let i = 0; i < samples.length; i++) {
                        // cts is composition time stamp
                        const diff = Math.abs(samples[i].cts - targetTime)
                        if (diff < minDiff) {
                            minDiff = diff
                            nearestSampleIndex = i
                        }
                    }

                    if (nearestSampleIndex !== -1) {
                        // Strategy: Decode the full GOP (Group of Pictures) containing the target frame.
                        // Strategy: Decode from preceding Keyframe up to the Target sample.
                        // We don't need to decode the whole GOP if we only want one frame.
                        // Stopping at nearestSampleIndex should stay within valid reference chain if we process linearly.
                        let decodeStartIndex = nearestSampleIndex
                        while (decodeStartIndex >= 0 && !samples[decodeStartIndex].is_sync) {
                            decodeStartIndex--
                        }

                        if (decodeStartIndex >= 0) {
                            // Mark all samples from decodeStartIndex up to nearestSampleIndex (inclusive)
                            for (let j = decodeStartIndex; j <= nearestSampleIndex; j++) {
                                framesToDecode.add(j)
                            }
                        }
                    }
                }

                // Sort indices to decode in order
                const indices = Array.from(framesToDecode).sort((a, b) => a - b)

                for (const idx of indices) {
                    const sample = samples[idx]
                    const type = sample.is_sync ? 'key' : 'delta'

                    const chunk = new EncodedVideoChunk({
                        type: type,
                        timestamp: (sample.cts * 1_000_000) / sample.timescale, // Microseconds
                        duration: (sample.duration * 1_000_000) / sample.timescale,
                        data: sample.data
                    })

                    try {
                        if (videoDecoder?.state === 'configured') {
                            videoDecoder?.decode(chunk)
                        }
                    } catch (e) {
                        console.error('Error decoding chunk', idx, e)
                    }
                }

                // If we have processed all relevant samples, we might need to flush
                videoDecoder?.flush().then(() => {
                    // Flush complete.
                    finish()
                }).catch(e => {
                    if (!e.message?.includes('closed')) {
                        console.error('Flush error:', e)
                    }
                    finish()
                })
            }

            const readChunk = (off: number) => {
                const uploadSize = 1024 * 1024 * 10
                const end = Math.min(off + uploadSize, file.size)
                const blob = file.slice(off, end)

                const reader = new FileReader()
                reader.onload = (e) => {
                    const buffer = (e.target as FileReader).result as ArrayBuffer
                    // @ts-ignore
                    buffer.fileStart = off

                    try {
                        mp4boxfile.appendBuffer(buffer as any)
                    } catch (err) {
                        console.error('MP4Box appendBuffer failed:', err)
                        // Stop reading, try to process what we have
                        if (hasReady) {
                            mp4boxfile.flush()
                            processAllSamples()
                        } else {
                            error.value = `File parsing failed: ${err}`
                            reject(err)
                        }
                        return
                    }

                    const nextOffset = off + buffer.byteLength

                    if (nextOffset < file.size) {
                        readChunk(nextOffset)
                    } else {
                        mp4boxfile.flush()
                        processAllSamples()
                    }
                }
                reader.onloadend = () => {
                    // Check error?
                }
                reader.onerror = () => {
                    reject(reader.error)
                }
                reader.readAsArrayBuffer(blob)
            }

            const loadFile = () => {
                readChunk(0)
            }

            loadFile()
        })
    }

    return {
        extractScreenshots,
        isProcessing,
        progress,
        error
    }
}

// Helper to extract AVC/HEVC description (AVCC/HVCC)
function toDesc(track: any) {
    const entry = track.mdia?.minf?.stbl?.stsd?.entries[0]

    if (entry) {
        // Handle AVC (H.264)
        if (entry.avcC) {
            console.log('Found avcC box, extracting description...')
            try {
                // @ts-ignore
                const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN)
                entry.avcC.write(stream)
                // Remove the 4 bytes size and 4 bytes 'avcC' header because write() outputs the whole box
                // We want the AVCDecoderConfigurationRecord which follows
                return new Uint8Array(stream.buffer.slice(8))
            } catch (e) {
                console.error('Error writing avcC to stream:', e)
                return undefined
            }
        }
        // Handle HEVC (H.265)
        else if (entry.hvcC) {
            console.log('Found hvcC box, extracting description...')
            try {
                // @ts-ignore
                const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN)
                entry.hvcC.write(stream)
                return new Uint8Array(stream.buffer.slice(8))
            } catch (e) {
                console.error('Error writing hvcC to stream:', e)
                return undefined
            }
        }
    }

    console.warn('No avcC or hvcC box found in track entry:', entry)
    return undefined
}
