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
        // Reusable canvas to prevent memory thrashing
        let sharedCanvas: OffscreenCanvas | null = null

        return new Promise((resolve, reject) => {
            const results: { [key: number]: string } = {}
            let pendingFrames = events.length
            let videoTrack: any = null
            const allSamples: any[] = []
            let isFinished = false
            let readyFired = false
            let fileFullyRead = false

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
                readyFired = true
                videoTrack = info.videoTracks[0]
                // ... (rest of onReady logic)

                // "info.videoTracks[0]" is a simplified object. We need the full track from the ISO file structure
                // to access the deep boxes like avcC/hvcC in stsd.
                const trackId = videoTrack.id
                // @ts-ignore
                const fullTrack = mp4boxfile.moov.traks.find((t: any) => t.tkhd.track_id === trackId)

                console.log('Full Track found:', !!fullTrack)

                const description = toDesc(fullTrack)

                // Initialize shared canvas once we know dimensions
                sharedCanvas = new OffscreenCanvas(videoTrack.video.width, videoTrack.video.height)


                console.log('Video Track Info:', {
                    codec: videoTrack.codec,
                    width: videoTrack.video.width,
                    height: videoTrack.video.height,
                    hasDescription: !!description
                })

                if (!description && (videoTrack.codec.startsWith('avc1') || videoTrack.codec.startsWith('hvc1') || videoTrack.codec.startsWith('hev1'))) {
                    const msg = `Failed to extract decoder description for codec ${videoTrack.codec}. This may be due to an unsupported file structure.`
                    console.error(msg)
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
                                if (!results[event.timestamp_seconds] && sharedCanvas) {
                                    // Reuse shared canvas to prevent memory thrashing
                                    const ctx = sharedCanvas.getContext('2d')

                                    if (ctx) {
                                        // Resize canvas if needed (handles variable frame sizes)
                                        if (sharedCanvas.width !== frame.displayWidth || sharedCanvas.height !== frame.displayHeight) {
                                            sharedCanvas.width = frame.displayWidth
                                            sharedCanvas.height = frame.displayHeight
                                        }

                                        ctx.drawImage(frame, 0, 0)
                                        sharedCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }).then(blob => {
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

                // If file is already fully read, process now (handles moov at end of file)
                if (fileFullyRead) {
                    processAllSamples()
                }
            }

            mp4boxfile.onSamples = (_id: number, _user: any, samples: any[]) => {
                allSamples.push(...samples)
            }

            const processAllSamples = async () => {
                const samples = allSamples

                if (samples.length === 0) {
                    console.warn('No samples to process')
                    finish()
                    return
                }

                // Build GOP ranges for each event independently
                // This prevents decoding errors from non-contiguous samples
                const gopRanges: Array<{ start: number; end: number; eventIndex: number }> = []

                for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
                    const event = events[eventIdx]
                    const targetTime = event.timestamp_seconds * videoTrack.timescale

                    // Find nearest sample
                    let nearestSampleIndex = -1
                    let minDiff = Infinity

                    for (let i = 0; i < samples.length; i++) {
                        const diff = Math.abs(samples[i].cts - targetTime)
                        if (diff < minDiff) {
                            minDiff = diff
                            nearestSampleIndex = i
                        }
                    }

                    if (nearestSampleIndex !== -1) {
                        // Find preceding keyframe
                        let decodeStartIndex = nearestSampleIndex
                        while (decodeStartIndex >= 0 && !samples[decodeStartIndex].is_sync) {
                            decodeStartIndex--
                        }

                        if (decodeStartIndex >= 0) {
                            gopRanges.push({
                                start: decodeStartIndex,
                                end: nearestSampleIndex,
                                eventIndex: eventIdx
                            })
                        }
                    }
                }

                console.log(`Processing ${gopRanges.length} GOP ranges for ${events.length} events`)

                // Sort GOP ranges by start index to process in order
                gopRanges.sort((a, b) => a.start - b.start)

                // Process GOP ranges, flushing only when necessary
                let lastProcessedIndex = -1

                for (let rangeIdx = 0; rangeIdx < gopRanges.length; rangeIdx++) {
                    if (isFinished) break

                    const range = gopRanges[rangeIdx]
                    const firstSample = samples[range.start]

                    // Validate keyframe
                    if (!firstSample.is_sync) {
                        console.warn(`GOP range ${range.start}-${range.end} doesn't start with keyframe (is_sync=false). Skipping event at ${events[range.eventIndex].timestamp_seconds}s`)
                        continue
                    }

                    // Determine if we need to flush before this GOP
                    // Flush if: 1) First GOP, 2) Gap in sequence, or 3) Previous range failed
                    const needsFlush = lastProcessedIndex === -1 || range.start > lastProcessedIndex + 1

                    try {
                        // Flush if there's a gap in the decode sequence
                        if (needsFlush && videoDecoder?.state === 'configured') {
                            await videoDecoder.flush()
                        }

                        // Decode all samples in this GOP range
                        for (let idx = range.start; idx <= range.end; idx++) {
                            if (isFinished) break

                            const sample = samples[idx]
                            const type = sample.is_sync ? 'key' : 'delta'

                            const chunk = new EncodedVideoChunk({
                                type: type,
                                timestamp: (sample.cts * 1_000_000) / sample.timescale,
                                duration: (sample.duration * 1_000_000) / sample.timescale,
                                data: sample.data
                            })

                            if (videoDecoder?.state === 'configured') {
                                videoDecoder.decode(chunk)
                            }
                        }

                        lastProcessedIndex = range.end

                        // Flush after last GOP or before a gap
                        const isLastRange = rangeIdx === gopRanges.length - 1
                        const nextRangeHasGap = !isLastRange && gopRanges[rangeIdx + 1].start > range.end + 1

                        if ((isLastRange || nextRangeHasGap) && videoDecoder?.state === 'configured') {
                            await videoDecoder.flush()
                        }

                    } catch (e: any) {
                        console.error(`Error processing GOP range ${range.start}-${range.end} (event at ${events[range.eventIndex].timestamp_seconds}s):`, e.message)

                        // Log debug info
                        console.error('Debug info:', {
                            rangeStart: range.start,
                            rangeEnd: range.end,
                            firstSampleIsSync: firstSample.is_sync,
                            needsFlush,
                            lastProcessedIndex,
                            decoderState: videoDecoder?.state
                        })

                        // Force flush to reset decoder state
                        try {
                            if (videoDecoder?.state === 'configured') {
                                await videoDecoder.flush()
                            }
                            lastProcessedIndex = -1 // Force flush before next range
                        } catch (flushError) {
                            console.warn('Failed to flush decoder after error:', flushError)
                        }
                    }
                }

                // Final finish
                finish()
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
                        fileFullyRead = true
                        mp4boxfile.flush()
                        // Only process if onReady has fired (prevents race condition)
                        if (readyFired) {
                            processAllSamples()
                        }
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
    if (!track) {
        console.warn('toDesc called with null/undefined track')
        return undefined
    }

    const entry = track.mdia?.minf?.stbl?.stsd?.entries[0]

    if (!entry) {
        console.warn('No stsd entry found in track structure')
        return undefined
    }

    // Handle AVC (H.264)
    if (entry.avcC) {
        console.log('Found avcC box, extracting description...')
        try {
            // @ts-ignore
            const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN)
            entry.avcC.write(stream)
            // Remove the 4 bytes size and 4 bytes 'avcC' header because write() outputs the whole box
            // We want the AVCDecoderConfigurationRecord which follows
            const desc = new Uint8Array(stream.buffer.slice(8))
            if (desc.length === 0) {
                console.error('avcC description is empty')
                return undefined
            }
            return desc
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
            const desc = new Uint8Array(stream.buffer.slice(8))
            if (desc.length === 0) {
                console.error('hvcC description is empty')
                return undefined
            }
            return desc
        } catch (e) {
            console.error('Error writing hvcC to stream:', e)
            return undefined
        }
    }

    console.warn('No avcC or hvcC box found in track entry. Available boxes:', Object.keys(entry))
    return undefined
}
