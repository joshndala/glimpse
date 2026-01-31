<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGeminiAnalysis, type AuditReport, type KeyMoment } from './composables/useGeminiAnalysis'

const { auditCaseFile, uploadProgress, isAnalyzing } = useGeminiAnalysis()

// File management
const videoFiles = ref<File[]>([])
const reportFiles = ref<File[]>([])
const isDragging = ref(false)

// Playback state
const currentVideoIndex = ref(0)
const videoElement = ref<HTMLVideoElement | null>(null)
const videoUrls = ref<string[]>([])

// Analysis state
const report = ref<AuditReport | null>(null)
const currentStep = ref<'upload' | 'analyzing' | 'complete'>('upload')
const errorMessage = ref<string | null>(null)

// Size limit (200MB)
const MAX_SIZE_BYTES = 200 * 1024 * 1024

// Computed properties
const totalSize = computed(() => {
  const videoSize = videoFiles.value.reduce((sum, f) => sum + f.size, 0)
  const reportSize = reportFiles.value.reduce((sum, f) => sum + f.size, 0)
  return videoSize + reportSize
})

const isOverSizeLimit = computed(() => totalSize.value > MAX_SIZE_BYTES)

const canSubmit = computed(() => {
  return (videoFiles.value.length > 0 || reportFiles.value.length > 0) && !isOverSizeLimit.value
})

const currentVideoUrl = computed(() => {
  if (videoUrls.value.length === 0) return null
  return videoUrls.value[currentVideoIndex.value] || videoUrls.value[0]
})

// File handling
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
  if (files) {
    processFiles(Array.from(files))
  }
}

const handleFileInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files) {
    processFiles(Array.from(target.files))
  }
  target.value = '' // Reset to allow selecting same files
}

const processFiles = (files: File[]) => {
  for (const file of files) {
    if (file.type.startsWith('video/')) {
      if (!videoFiles.value.some(f => f.name === file.name && f.size === file.size)) {
        videoFiles.value.push(file)
        videoUrls.value.push(URL.createObjectURL(file))
      }
    } else if (
      file.type === 'application/pdf' ||
      file.type.startsWith('image/') ||
      file.type.includes('spreadsheet') ||
      file.type.includes('excel') ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')
    ) {
      if (!reportFiles.value.some(f => f.name === file.name && f.size === file.size)) {
        reportFiles.value.push(file)
      }
    }
  }
}

const removeVideo = (index: number) => {
  URL.revokeObjectURL(videoUrls.value[index])
  videoUrls.value.splice(index, 1)
  videoFiles.value.splice(index, 1)
  if (currentVideoIndex.value >= videoFiles.value.length) {
    currentVideoIndex.value = Math.max(0, videoFiles.value.length - 1)
  }
}

const removeReport = (index: number) => {
  reportFiles.value.splice(index, 1)
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Playlist controls
const switchToVideo = (index: number) => {
  currentVideoIndex.value = index
}

const seekToMoment = (moment: KeyMoment) => {
  if (moment.video_index !== currentVideoIndex.value) {
    currentVideoIndex.value = moment.video_index
    // Wait for video to load before seeking
    setTimeout(() => {
      if (videoElement.value) {
        videoElement.value.currentTime = moment.timestamp_seconds
      }
    }, 100)
  } else if (videoElement.value) {
    videoElement.value.currentTime = moment.timestamp_seconds
  }
}

// Analysis
const startAnalysis = async () => {
  errorMessage.value = null
  currentStep.value = 'analyzing'
  
  try {
    const result = await auditCaseFile(videoFiles.value, reportFiles.value)
    report.value = result
    currentStep.value = 'complete'
  } catch (err) {
    console.error('Analysis error:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Analysis failed'
    currentStep.value = 'upload'
  }
}

const reset = () => {
  // Revoke all object URLs
  for (const url of videoUrls.value) {
    URL.revokeObjectURL(url)
  }
  
  videoFiles.value = []
  reportFiles.value = []
  videoUrls.value = []
  currentVideoIndex.value = 0
  report.value = null
  currentStep.value = 'upload'
  errorMessage.value = null
}

const getModeLabel = (mode: string): string => {
  switch (mode) {
    case 'audit': return '🔍 Audit Mode'
    case 'scout': return '👀 Scout Mode'
    case 'analyst': return '📊 Analyst Mode'
    default: return mode
  }
}

const getVerdictColor = (verdict: string): string => {
  const lower = verdict.toLowerCase()
  if (lower.includes('verified') || lower.includes('confirmed')) return 'text-green-400'
  if (lower.includes('discrepanc')) return 'text-yellow-400'
  if (lower.includes('unable') || lower.includes('insufficient')) return 'text-gray-400'
  return 'text-blue-400'
}
</script>

<template>
  <div class="min-h-screen p-8">
    <div class="max-w-6xl mx-auto">
      <!-- Header -->
      <header class="text-center mb-10">
        <h1 class="text-4xl font-bold mb-2 text-brand-accent">
          Hylite Studio
        </h1>
        <p class="text-lg text-slate-400">
          Sports Recruitment Auditor
        </p>
      </header>

      <!-- Description Section -->
      <div v-if="currentStep === 'upload'" class="glass-card p-6 mb-6">
        <h2 class="text-2xl font-bold text-white mb-4">How It Works</h2>
        <p class="text-slate-300 mb-4 leading-relaxed">
          Upload a player's case file—videos, stat sheets, reports, or any combination—and our AI will analyze the evidence to help you make informed recruitment decisions.
        </p>
        
        <div class="grid md:grid-cols-3 gap-4">
          <div class="bg-slate-800/50 rounded-lg p-4">
            <div class="text-3xl mb-2">🔍</div>
            <h3 class="text-brand-accent font-semibold mb-1">Audit Mode</h3>
            <p class="text-slate-400 text-sm">Upload videos + reports to cross-reference claims against actual footage</p>
          </div>
          
          <div class="bg-slate-800/50 rounded-lg p-4">
            <div class="text-3xl mb-2">👀</div>
            <h3 class="text-brand-accent font-semibold mb-1">Scout Mode</h3>
            <p class="text-slate-400 text-sm">Upload videos only for an unbiased evaluation of player skills and potential</p>
          </div>
          
          <div class="bg-slate-800/50 rounded-lg p-4">
            <div class="text-3xl mb-2">📊</div>
            <h3 class="text-brand-accent font-semibold mb-1">Analyst Mode</h3>
            <p class="text-slate-400 text-sm">Upload reports only to identify statistical outliers and red flags</p>
          </div>
        </div>
      </div>

      <!-- Upload Section -->
      <div v-if="currentStep === 'upload'" class="space-y-6">
        <!-- Size Warning -->
        <div v-if="isOverSizeLimit" class="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-center gap-3">
          <span class="text-2xl">⚠️</span>
          <div>
            <p class="text-red-400 font-semibold">Total size exceeds 200MB limit</p>
            <p class="text-red-300 text-sm">Current: {{ formatSize(totalSize) }} / 200 MB</p>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="errorMessage" class="bg-red-500/20 border border-red-500 rounded-lg p-4">
          <p class="text-red-400">{{ errorMessage }}</p>
        </div>

        <!-- Drop Zone -->
        <div
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          :class="[
            'glass-card p-8 text-center cursor-pointer transition-all duration-300',
            isDragging ? 'border-brand-accent bg-brand-accent/10 border-solid' : 'border-dashed border-2 border-slate-600 hover:border-slate-500'
          ]"
          @click="($refs.fileInput as HTMLInputElement)?.click()"
        >
          <input
            ref="fileInput"
            type="file"
            accept="video/*,application/pdf,image/*,.xlsx,.xls"
            multiple
            class="hidden"
            @change="handleFileInput"
          />
          
          <div class="text-5xl mb-4">📁</div>
          <h3 class="text-xl font-semibold text-white mb-2">
            Drop your Case Files here
          </h3>
          <p class="text-slate-400 mb-2">
            Videos • PDFs • Screenshots • Stat Sheets
          </p>
          <p class="text-slate-500 text-sm">
            Max 200MB total
          </p>
        </div>

        <!-- File Preview Grid -->
        <div v-if="videoFiles.length > 0 || reportFiles.length > 0" class="grid md:grid-cols-2 gap-6">
          <!-- Videos Section -->
          <div class="glass-card p-5">
            <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span class="text-2xl">🎬</span>
              Footage ({{ videoFiles.length }})
            </h3>
            <div class="space-y-3">
              <div 
                v-for="(file, index) in videoFiles" 
                :key="`video-${index}`"
                class="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-slate-400">{{ index + 1 }}.</span>
                  <span class="text-white truncate">{{ file.name }}</span>
                  <span class="text-slate-500 text-sm whitespace-nowrap">{{ formatSize(file.size) }}</span>
                </div>
                <button 
                  @click.stop="removeVideo(index)"
                  class="text-red-400 hover:text-red-300 px-2"
                >
                  ✕
                </button>
              </div>
              <p v-if="videoFiles.length === 0" class="text-slate-500 text-center py-4">
                No videos added
              </p>
            </div>
          </div>

          <!-- Reports Section -->
          <div class="glass-card p-5">
            <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span class="text-2xl">📄</span>
              Documents ({{ reportFiles.length }})
            </h3>
            <div class="space-y-3">
              <div 
                v-for="(file, index) in reportFiles" 
                :key="`report-${index}`"
                class="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-xl">
                    {{ file.type === 'application/pdf' ? '📕' : file.type.startsWith('image/') ? '🖼️' : '📊' }}
                  </span>
                  <span class="text-white truncate">{{ file.name }}</span>
                  <span class="text-slate-500 text-sm whitespace-nowrap">{{ formatSize(file.size) }}</span>
                </div>
                <button 
                  @click.stop="removeReport(index)"
                  class="text-red-400 hover:text-red-300 px-2"
                >
                  ✕
                </button>
              </div>
              <p v-if="reportFiles.length === 0" class="text-slate-500 text-center py-4">
                No documents added
              </p>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div v-if="canSubmit" class="flex gap-3">
          <button
            @click="startAnalysis"
            class="flex-1 bg-brand-accent hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-brand-accent/30"
          >
            Analyze Case File
          </button>
          <button
            @click="reset"
            class="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300"
          >
            Clear All
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else-if="currentStep === 'analyzing'" class="glass-card p-12 text-center">
        <div class="mb-8 flex justify-center">
          <div class="relative w-20 h-20">
            <div class="absolute inset-0 border-4 border-brand-accent/30 rounded-full"></div>
            <div class="absolute inset-0 border-4 border-transparent border-t-brand-accent rounded-full animate-spin"></div>
          </div>
        </div>
        <h2 class="text-2xl font-semibold mb-3 text-white">
          Analyzing Case File... {{ uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : '' }}
        </h2>
        <p class="text-slate-400">
          AI is reviewing {{ videoFiles.length }} video(s) and {{ reportFiles.length }} document(s)
        </p>
      </div>

      <!-- Report Section -->
      <div v-else-if="report" class="space-y-6">
        <!-- Report Header -->
        <div class="glass-card p-6">
          <div class="flex items-start justify-between mb-4">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <span class="bg-brand-accent/20 text-brand-accent px-3 py-1 rounded-full text-sm font-medium">
                  {{ getModeLabel(report.mode) }}
                </span>
                <span v-if="report.scout_rating" class="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium">
                  Rating: {{ report.scout_rating }}/10
                </span>
              </div>
              <h2 class="text-2xl font-bold text-white">
                Recruitment Audit Report
              </h2>
            </div>
            <button
              @click="reset"
              class="glass-card px-4 py-2 hover:bg-white/10 transition-all duration-300 text-sm"
            >
              New Analysis
            </button>
          </div>

          <!-- Verdict -->
          <div class="mb-4 p-4 bg-slate-800/50 rounded-lg">
            <span class="text-slate-400 text-sm">Verdict:</span>
            <p :class="['text-lg font-semibold', getVerdictColor(report.verdict)]">
              {{ report.verdict }}
            </p>
          </div>

          <!-- Player Info -->
          <div v-if="report.player_info" class="flex items-center gap-4 mb-4 text-slate-400">
            <span v-if="report.player_info.jersey_number" class="bg-brand-accent/20 text-brand-accent px-3 py-1 rounded-full text-sm font-medium">
              #{{ report.player_info.jersey_number }}
            </span>
            <span v-if="report.player_info.position">{{ report.player_info.position }}</span>
            <span v-if="report.player_info.team">{{ report.player_info.team }}</span>
          </div>

          <!-- Summary -->
          <div class="prose prose-invert max-w-none">
            <p class="text-slate-300 leading-relaxed whitespace-pre-line">{{ report.summary }}</p>
          </div>
        </div>

        <!-- Video Player with Playlist (only if videos exist) -->
        <div v-if="videoFiles.length > 0" class="glass-card p-6">
          <h3 class="text-xl font-bold text-white mb-4">Video Evidence</h3>
          <div class="flex gap-6">
            <!-- Playlist Sidebar -->
            <div v-if="videoFiles.length > 1" class="w-48 space-y-2">
              <button
                v-for="(file, index) in videoFiles"
                :key="`playlist-${index}`"
                @click="switchToVideo(index)"
                :class="[
                  'w-full text-left p-3 rounded-lg transition-all',
                  currentVideoIndex === index 
                    ? 'bg-brand-accent/20 border border-brand-accent text-white' 
                    : 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-300'
                ]"
              >
                <div class="text-sm font-medium truncate">Video {{ index + 1 }}</div>
                <div class="text-xs text-slate-500 truncate">{{ file.name }}</div>
              </button>
            </div>

            <!-- Video Player -->
            <div class="flex-1">
              <video
                ref="videoElement"
                :src="currentVideoUrl || undefined"
                controls
                class="w-full rounded-lg bg-black"
              ></video>
              <p class="text-slate-500 text-sm mt-2 text-center">
                {{ videoFiles[currentVideoIndex]?.name }}
              </p>
            </div>
          </div>
        </div>

        <!-- Key Moments -->
        <div v-if="report.key_moments && report.key_moments.length > 0" class="glass-card p-6">
          <h3 class="text-xl font-bold text-white mb-4">Key Moments</h3>
          <div class="space-y-3">
            <button
              v-for="(moment, index) in report.key_moments"
              :key="`moment-${index}`"
              @click="seekToMoment(moment)"
              class="w-full text-left bg-slate-800/50 hover:bg-slate-700/50 rounded-lg p-4 transition-colors"
            >
              <div class="flex items-center gap-3 mb-1">
                <span class="bg-brand-accent text-white text-xs px-2 py-1 rounded font-medium">
                  Video {{ moment.video_index + 1 }} @ {{ formatTimestamp(moment.timestamp_seconds) }}
                </span>
                <span class="text-white font-medium">{{ moment.title }}</span>
              </div>
              <p class="text-slate-400 text-sm">{{ moment.description }}</p>
            </button>
          </div>
        </div>

        <!-- Strengths & Weaknesses -->
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Strengths -->
          <div v-if="report.strengths && report.strengths.length > 0" class="glass-card p-6">
            <h3 class="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
              <span>💪</span> Strengths
            </h3>
            <ul class="space-y-2">
              <li v-for="(strength, index) in report.strengths" :key="`strength-${index}`" class="text-slate-300 flex items-start gap-2">
                <span class="text-green-400">✓</span>
                {{ strength }}
              </li>
            </ul>
          </div>

          <!-- Weaknesses -->
          <div v-if="report.weaknesses && report.weaknesses.length > 0" class="glass-card p-6">
            <h3 class="text-xl font-bold text-yellow-400 mb-4 flex items-center gap-2">
              <span>📉</span> Areas for Improvement
            </h3>
            <ul class="space-y-2">
              <li v-for="(weakness, index) in report.weaknesses" :key="`weakness-${index}`" class="text-slate-300 flex items-start gap-2">
                <span class="text-yellow-400">•</span>
                {{ weakness }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Red Flags -->
        <div v-if="report.red_flags && report.red_flags.length > 0" class="glass-card p-6 border border-red-500/30">
          <h3 class="text-xl font-bold text-red-400 mb-4 flex items-center gap-2">
            <span>🚩</span> Red Flags
          </h3>
          <ul class="space-y-2">
            <li v-for="(flag, index) in report.red_flags" :key="`flag-${index}`" class="text-slate-300 flex items-start gap-2">
              <span class="text-red-400">⚠</span>
              {{ flag }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
