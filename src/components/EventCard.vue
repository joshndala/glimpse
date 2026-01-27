<script setup lang="ts">
import type { VideoEvent } from '../composables/useVideoScreenshots'

defineProps<{
  event: VideoEvent
}>()
</script>

<template>
  <div class="glass-card-hover overflow-hidden group flex flex-col">
    <!-- Screenshot -->
    <div class="relative aspect-video bg-slate-800/50 overflow-hidden flex-shrink-0">
      <img 
        v-if="event.screenshot" 
        :src="event.screenshot" 
        :alt="`Screenshot at ${event.timestamp_seconds}s`"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div 
        v-else 
        class="w-full h-full flex items-center justify-center text-slate-500"
      >
        <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </div>
      
      <!-- Timestamp badge -->
      <div class="absolute top-3 right-3 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
        {{ formatTimestamp(event.timestamp_seconds) }}
      </div>
    </div>

    <!-- Content -->
    <div class="p-5 flex-grow flex flex-col">
      <!-- Title -->
      <h3 class="text-lg font-semibold text-white mb-2">
        {{ event.title }}
      </h3>
      
      <!-- Description -->
      <p class="text-slate-300 leading-relaxed mb-3 text-sm">
        {{ event.description }}
      </p>
      
      <!-- Insights (if present) -->
      <div v-if="event.insights" class="mt-auto pt-3 border-t border-slate-700/50">
        <p class="text-xs text-purple-300 italic">
          💡 {{ event.insights }}
        </p>
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
