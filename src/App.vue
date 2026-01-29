<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGeminiAnalysis, type PerformanceReport } from './composables/useGeminiAnalysis'
import { useHighPerformanceScreenshots } from './composables/useHighPerformanceScreenshots'

const { analyzeVideo, uploadProgress } = useGeminiAnalysis()
const { extractScreenshots } = useHighPerformanceScreenshots()

const isDragging = ref(false)
const selectedFile = ref<File | null>(null)
const report = ref<PerformanceReport | null>(null)
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

  if (file.size > 200 * 1024 * 1024) {
    alert('File size exceeds 200MB limit. Please upload a smaller video.')
    return
  }

  selectedFile.value = file
  report.value = null
  currentStep.value = 'ready'
}

const startAnalysis = async () => {
  if (!selectedFile.value) return
  
  try {
    // Step 1: Analyze with Gemini
    currentStep.value = 'analyzing'
    const analysisResult = await analyzeVideo(selectedFile.value, customPrompt.value || undefined)

    // Step 2: Extract screenshots for key highlights only (3-5)
    currentStep.value = 'extracting'
    const highlightsWithScreenshots = await extractScreenshots(selectedFile.value, analysisResult.key_highlights)
    
    // Filter out highlights that failed screenshot extraction
    const successfulHighlights = highlightsWithScreenshots.filter(h => h.screenshot && h.screenshot !== '')
    
    // Update report with only successful screenshots
    report.value = {
      ...analysisResult,
      key_highlights: successfulHighlights
    }
    currentStep.value = 'complete'

  } catch (err) {
    console.error('Error processing video:', err)
    currentStep.value = 'ready'
  }
}

const reset = () => {
  selectedFile.value = null
  report.value = null
  currentStep.value = 'upload'
  customPrompt.value = ''
}

const statusMessage = computed(() => {
  switch (currentStep.value) {
    case 'analyzing':
      return `Analyzing video with AI... ${uploadProgress.value > 0 && uploadProgress.value < 100 ? uploadProgress.value + '%' : ''}`
    case 'extracting':
      return 'Processing video & extracting screenshots...'
    default:
      return ''
  }
})

const statusSubMessage = computed(() => {
  switch (currentStep.value) {
    case 'analyzing':
      return 'AI is identifying key player moments'
    case 'extracting':
      return 'Converting video format for optimal quality. This may take 30-60 seconds.'
    default:
      return ''
  }
})

const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="min-h-screen p-8">
    <div class="max-w-5xl mx-auto">
      <!-- Header -->
      <header class="text-center mb-12">
        <h1 class="text-5xl font-bold mb-3 text-brand-accent">
          Hylite Studio
        </h1>
        <p class="text-lg text-text-primary-dark">
          AI-Powered Sports Player Performance Analysis
        </p>
      </header>

      <!-- Upload Section -->
      <div v-if="currentStep === 'upload' || currentStep === 'ready'" class="space-y-6">
        <!-- Player Filter (Optional) -->
        <div class="glass-card p-6">
          <label class="block text-sm font-medium text-slate-300 mb-3">
            Filter by Player (Optional)
          </label>
          <input
            v-model="customPrompt"
            type="text"
            placeholder="e.g., 'Focus on #23' or 'Analyze the goalkeeper'"
            class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-accent transition-colors"
          />
          <p class="mt-2 text-xs text-slate-500">
            Leave blank to analyze the main player in the video
          </p>
        </div>

        <!-- Drop Zone -->
        <div
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          :class="[
            'glass-card p-12 text-center cursor-pointer transition-all duration-300',
            isDragging ? 'border-brand-accent bg-brand-accent/10' : 'border-dashed border-2 border-slate-600 hover:border-slate-500'
          ]"
          @click="($refs.fileInput as HTMLInputElement)?.click()"
        >
          <input
            ref="fileInput"
            type="file"
            accept="video/*"
            class="hidden"
            @change="handleFileInput"
          />
          
          <div v-if="!selectedFile">
            <div class="text-5xl mb-4">🎬</div>
            <h3 class="text-xl font-semibold text-white mb-2">
              Drop your highlight video here
            </h3>
            <p class="text-slate-400">
              or click to browse • Max 200MB
            </p>
          </div>
          
          <div v-else>
            <div class="text-5xl mb-4">✅</div>
            <h3 class="text-xl font-semibold text-white mb-2">
              {{ selectedFile.name }}
            </h3>
            <p class="text-slate-400">
              {{ (selectedFile.size / 1024 / 1024).toFixed(1) }} MB
            </p>
          </div>
        </div>

        <!-- Analyze Button -->
        <div v-if="selectedFile" class="flex gap-3">
          <button
            @click="startAnalysis"
            class="flex-1 bg-brand-accent hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-brand-accent/30"
          >
            Generate Report
          </button>
          <button
            @click="reset"
            class="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else-if="currentStep === 'analyzing' || currentStep === 'extracting'" class="glass-card p-12 text-center">
        <div class="mb-8 flex justify-center">
          <div class="relative w-20 h-20">
            <div class="absolute inset-0 border-4 border-brand-accent/30 rounded-full"></div>
            <div class="absolute inset-0 border-4 border-transparent border-t-brand-accent rounded-full animate-spin"></div>
          </div>
        </div>
        <h2 class="text-2xl font-semibold mb-3 text-white">
          {{ statusMessage }}
        </h2>
        <p class="text-slate-400">
          {{ statusSubMessage }}
        </p>
      </div>

      <!-- Report Section -->
      <div v-else-if="report" class="space-y-8">
        <!-- Report Header -->
        <div class="glass-card p-8">
          <div class="flex items-start justify-between mb-6">
            <div>
              <h2 class="text-3xl font-bold text-white mb-2">
                Player Performance Report
              </h2>
              <div class="flex items-center gap-4 text-slate-400">
                <span v-if="report.player_info.jersey_number" class="bg-brand-accent/20 text-brand-accent px-3 py-1 rounded-full text-sm font-medium">
                  #{{ report.player_info.jersey_number }}
                </span>
                <span v-if="report.player_info.position">{{ report.player_info.position }}</span>
                <span v-if="report.player_info.team">{{ report.player_info.team }}</span>
              </div>
            </div>
            <button
              @click="reset"
              class="glass-card px-5 py-2 hover:bg-white/10 transition-all duration-300 text-sm"
            >
              New Analysis
            </button>
          </div>

          <!-- Performance Rating -->
          <div v-if="report.performance_rating" class="mb-6 p-4 bg-brand-accent/10 rounded-lg border border-brand-accent/20">
            <span class="text-brand-accent font-semibold">Performance Rating:</span>
            <span class="text-white ml-2">{{ report.performance_rating }}</span>
          </div>

          <!-- Summary -->
          <div class="prose prose-invert max-w-none">
            <p class="text-slate-300 leading-relaxed whitespace-pre-line">{{ report.summary }}</p>
          </div>
        </div>

        <!-- Key Highlights with Screenshots -->
        <div class="glass-card p-8">
          <h3 class="text-2xl font-bold text-white mb-6">Key Highlights</h3>
          <div class="grid gap-6">
            <div 
              v-for="(highlight, index) in report.key_highlights" 
              :key="index"
              class="bg-slate-800/50 rounded-lg overflow-hidden"
            >
              <!-- Screenshot -->
              <div v-if="highlight.screenshot" class="aspect-video bg-slate-900">
                <img 
                  :src="highlight.screenshot" 
                  :alt="highlight.title"
                  class="w-full h-full object-cover"
                />
              </div>
              <!-- Highlight Info -->
              <div class="p-4">
                <div class="flex items-center gap-3 mb-2">
                  <span class="bg-brand-accent text-white text-xs px-2 py-1 rounded font-medium">
                    {{ formatTimestamp(highlight.timestamp_seconds) }}
                  </span>
                  <h4 class="text-lg font-semibold text-white">{{ highlight.title }}</h4>
                </div>
                <p class="text-slate-400 text-sm">{{ highlight.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="glass-card p-8">
          <h3 class="text-2xl font-bold text-white mb-6">Match Timeline</h3>
          <div class="space-y-3">
            <div 
              v-for="(moment, index) in report.timeline" 
              :key="index"
              class="flex items-start gap-4 py-3 border-b border-slate-700/50 last:border-0"
            >
              <span class="text-brand-accent font-mono text-sm min-w-[50px]">
                {{ formatTimestamp(moment.timestamp_seconds) }}
              </span>
              <p class="text-slate-300">{{ moment.moment }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
