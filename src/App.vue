<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGeminiAnalysis } from './composables/useGeminiAnalysis'
import { useVideoScreenshots, type VideoEvent } from './composables/useVideoScreenshots'

const { analyzeVideo, isAnalyzing, error: analysisError, uploadProgress } = useGeminiAnalysis()
const { loadVideo, addScreenshotsToEvents, cleanup, loadingProgress } = useVideoScreenshots()

const isDragging = ref(false)
const selectedFile = ref<File | null>(null)
const events = ref<VideoEvent[]>([])
const currentStep = ref<'upload' | 'ready' | 'analyzing' | 'extracting' | 'complete'>('upload')
const customPrompt = ref('')

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFileSelect(files[0])
  }
}

const handleFileInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    handleFileSelect(target.files[0])
  }
}

const handleFileSelect = (file: File) => {
  if (!file.type.startsWith('video/')) {
    alert('Please select a video file')
    return
  }

  if (file.size > 90 * 1024 * 1024) {
    alert('File size exceeds 90MB limit. Please upload a smaller video.')
    return
  }

  selectedFile.value = file
  events.value = []
  currentStep.value = 'ready'
}

const startAnalysis = async () => {
  if (!selectedFile.value) return
  
  try {
    // Step 1: Load video for screenshot extraction
    currentStep.value = 'analyzing'
    await loadVideo(selectedFile.value)

    // Step 2: Analyze with Gemini
    const analyzedEvents = await analyzeVideo(selectedFile.value, customPrompt.value || undefined)

    // Step 3: Extract screenshots
    currentStep.value = 'extracting'
    const eventsWithScreenshots = await addScreenshotsToEvents(analyzedEvents)
    
    events.value = eventsWithScreenshots
    currentStep.value = 'complete'

  } catch (err) {
    console.error('Error processing video:', err)
    currentStep.value = 'ready'
  }
}

const reset = () => {
  cleanup()
  selectedFile.value = null
  events.value = []
  currentStep.value = 'upload'
  customPrompt.value = ''
}

const statusMessage = computed(() => {
  switch (currentStep.value) {
    case 'analyzing':
      if (loadingProgress.value < 60) {
        return `Loading video processing engine... ${loadingProgress.value}%`
      }
      return `Analyzing video with Gemini AI... ${uploadProgress.value}%`
    case 'extracting':
      return `Extracting screenshots... ${loadingProgress.value}%`
    case 'complete':
      return 'Analysis Complete'
    default:
      return ''
  }
})
</script>

<template>
  <div class="min-h-screen px-6 py-12">
    <div class="max-w-5xl mx-auto">
      <!-- Header -->
      <header class="text-center mb-16">
        <h1 class="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
          Glimpse
        </h1>
        <p class="text-xl text-slate-400">
          AI-Powered Video Semantic Analyzer
        </p>
      </header>

      <!-- Upload Section -->
      <div v-if="currentStep === 'upload'" class="max-w-2xl mx-auto">
        <!-- Custom Prompt (Optional) -->
        <div class="glass-card p-6 mb-6">
          <label class="block text-sm font-medium text-slate-300 mb-3">
            What should I look for? (Optional)
          </label>
          <input
            v-model="customPrompt"
            type="text"
            placeholder="e.g., 'Find all goals and fouls' or 'Identify slide changes' or 'Show me explosions'"
            class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <p class="mt-2 text-xs text-slate-500">
            Leave blank for automatic comprehensive analysis
          </p>
        </div>

        <div
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          :class="[
            'glass-card p-12 text-center cursor-pointer transition-all duration-300',
            isDragging ? 'border-purple-500 bg-purple-500/10 scale-105' : 'hover:border-purple-500/50'
          ]"
        >
          <input
            type="file"
            accept="video/*"
            @change="handleFileInput"
            class="hidden"
            id="video-input"
          />
          <label for="video-input" class="cursor-pointer block">
            <!-- Upload Icon -->
            <div class="mb-6 flex justify-center">
              <svg class="w-24 h-24 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            
            <h2 class="text-2xl font-semibold mb-3 text-white">
              Drop your video here
            </h2>
            <p class="text-slate-400 mb-6">
              or click to browse
            </p>
            <p class="text-sm text-slate-500">
              Supports MP4, MOV, AVI (Max 90MB)
            </p>
          </label>
        </div>

        <div v-if="analysisError" class="mt-6 glass-card p-4 border-red-500/50 bg-red-500/10">
          <p class="text-red-400 text-sm">
            {{ analysisError }}
          </p>
        </div>
      </div>

      <!-- Ready to Analyze Section -->
      <div v-else-if="currentStep === 'ready'" class="max-w-2xl mx-auto">
        <div class="glass-card p-8">
          <div class="flex items-start gap-4 mb-6">
            <div class="flex-shrink-0">
              <svg class="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="flex-grow">
              <h3 class="text-xl font-semibold text-white mb-2">Video Ready</h3>
              <p class="text-slate-300 mb-1">{{ selectedFile?.name }}</p>
              <p class="text-sm text-slate-500">{{ (selectedFile!.size / 1024 / 1024).toFixed(2) }} MB</p>
            </div>
          </div>

          <!-- Custom Prompt Input -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-slate-300 mb-3">
              Analysis Instructions (Optional)
            </label>
            <input
              v-model="customPrompt"
              type="text"
              placeholder="e.g., 'Find all goals and fouls' or 'Identify slide changes'"
              class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <p class="mt-2 text-xs text-slate-500">
              Leave blank for comprehensive analysis
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3">
            <button
              @click="startAnalysis"
              class="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-purple-500/30"
            >
              Start Analysis
            </button>
            <button
              @click="reset"
              class="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Processing Section -->
      <div v-else-if="currentStep !== 'complete'" class="max-w-2xl mx-auto">
        <div class="glass-card p-12 text-center">
          <!-- Animated Loader -->
          <div class="mb-8 flex justify-center">
            <div class="relative w-24 h-24">
              <div class="absolute inset-0 border-4 border-purple-500/30 rounded-full"></div>
              <div class="absolute inset-0 border-4 border-transparent border-t-purple-500 rounded-full animate-spin"></div>
            </div>
          </div>

          <h2 class="text-2xl font-semibold mb-3 text-white">
            {{ statusMessage }}
          </h2>
          <p class="text-slate-400">
            This may take a moment...
          </p>
        </div>
      </div>

      <!-- Results Section - Report Style -->
      <div v-else class="max-w-4xl mx-auto">
        <!-- Results Header -->
        <div class="flex items-center justify-between mb-8 pb-6 border-b border-slate-700">
          <div>
            <h2 class="text-3xl font-bold text-white mb-2">
              Video Analysis Report
            </h2>
            <p class="text-slate-400">
              {{ events.length }} key moments identified
            </p>
          </div>
          <button
            @click="reset"
            class="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 font-medium"
          >
            New Analysis
          </button>
        </div>

        <!-- Report Content -->
        <div class="space-y-8">
          <div 
            v-for="(event, index) in events" 
            :key="index"
            class="glass-card p-6 hover:bg-white/5 transition-all duration-300"
          >
            <!-- Event Header -->
            <div class="flex items-start gap-4 mb-4">
              <div class="flex-shrink-0 w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <span class="text-purple-300 font-bold">{{ index + 1 }}</span>
              </div>
              <div class="flex-grow">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-xl font-semibold text-white">
                    {{ event.title }}
                  </h3>
                  <span class="text-xs bg-slate-700 px-2 py-1 rounded-full text-slate-300">
                    {{ formatTimestamp(event.timestamp_seconds) }}
                  </span>
                </div>
                <p class="text-slate-300 leading-relaxed">
                  {{ event.description }}
                </p>
              </div>
            </div>

            <!-- Screenshot -->
            <div v-if="event.screenshot" class="mb-4 rounded-lg overflow-hidden">
              <img 
                :src="event.screenshot" 
                :alt="`Screenshot at ${event.timestamp_seconds}s`"
                class="w-full h-auto"
              />
            </div>

            <!-- Insights -->
            <div v-if="event.insights" class="mt-4 pt-4 border-t border-slate-700/50">
              <div class="flex items-start gap-2">
                <span class="text-purple-400 text-sm">💡</span>
                <p class="text-sm text-purple-300 italic flex-grow">
                  {{ event.insights }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>
