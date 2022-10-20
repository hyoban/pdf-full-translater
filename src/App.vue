<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDark, useWindowSize } from '@vueuse/core'

import { readBinaryFile } from '@tauri-apps/api/fs'
import { BaseDirectory } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/api/dialog'

import { translateFromDeepl } from './utils/network'
import { isRendering, parsedSentences, renderPdfToCanvas } from './utils/pdf'

const { width } = useWindowSize()
const slider = ref(width.value / 2)

watch(width, (newWidth, oldWidth) => {
  // 屏幕尺寸变更时，保持滑块位置不变
  slider.value = newWidth / oldWidth * slider.value
})

const pdfBinaryData = ref<ArrayBuffer>()
const fileName = ref('')
const isLoadingPdfData = ref(false)
const isPdfSelected = ref(false)

const openFileDialog = async () => {
  const selected = await open({
    multiple: false,
    filters: [{
      name: 'PDF',
      extensions: ['pdf'],
    }],
  })
  if (selected !== null && !Array.isArray(selected)) {
    isLoadingPdfData.value = true

    fileName.value = /^(\w:)?[\\\/]/.test(selected) // use regex to check windows path
      ? selected.split('\\').pop() || ''
      : selected.split('/').pop() || ''

    const welcomePdf = await readBinaryFile(selected)
    pdfBinaryData.value = welcomePdf

    isLoadingPdfData.value = false
    isPdfSelected.value = true
  }
}

const translatedSentences = ref<string[]>()
const translateToken = ref('')

watch(parsedSentences, async () => {
  if (!parsedSentences.value || parsedSentences.value.length === 0)
    return
  if (!translateToken.value)
    return

  translatedSentences.value = await Promise.all(
    // FIXME: 翻译全部句子
    parsedSentences.value.slice(0, 3).map(i => translateFromDeepl(i, translateToken.value)),
  )
})

const sentences = computed(() => {
  if (!parsedSentences.value)
    return []

  return parsedSentences.value.map((sentence, index) => ({
    sentence,
    translation: translatedSentences.value?.[index] ?? '',
  }))
})

// 默认展示我的简历 pdf
const isDark = useDark()

watch(isDark, async () => {
  if (!isPdfSelected.value) {
    const welcomePdf = await readBinaryFile(`pdfs/example-${isDark.value ? 'dark' : 'light'}.pdf`, { dir: BaseDirectory.Resource })
    pdfBinaryData.value = welcomePdf
  }
}, { immediate: true })

const pdfViewer = ref<HTMLElement>()

const render = async () => {
  await renderPdfToCanvas(
    pdfBinaryData.value as ArrayBuffer,
    pdfViewer.value as HTMLElement,
    slider.value,
  )
}

const debounce = (func: { apply: (arg0: void, arg1: any) => void }, timeout = 300) => {
  let timer: number | undefined
  return (...args: any) => {
    clearTimeout(timer)
    timer = setTimeout(() => { func.apply(this, args) }, timeout)
  }
}

const debounceRender = debounce(async () => {
  await render()
}, 300)

watch(
  [slider, pdfBinaryData],
  async (
    [newSlider],
    [oldSlider],
  ) => {
    if (newSlider === oldSlider)
      render()
    debounceRender()
  },
  { immediate: true },
)

const onMouseDown = (e: MouseEvent) => {
  const { clientX } = e
  const { left } = (e.target! as HTMLDivElement).getBoundingClientRect()

  const diff = clientX - left

  const onMouseMove = (e: MouseEvent) => {
    const { clientX } = e
    slider.value = clientX - diff
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div relative flex="~ row" min-h-screen min-w-screen justify-between items-center>
    <div
      v-show="isLoadingPdfData || isRendering"
      text-green i-mdi-loading animate-spin
      absolute z-10 w-10 h-10 top="1/2"
      :style="{
        left: `${slider / 2}px`,
      }"
    />
    <div
      id="pdf-viewer"
      ref="pdfViewer"
      max-h-screen
      overflow-y-scroll
      flex-none
      :class="(isLoadingPdfData || isRendering) ? 'op-0' : ''"
      :style="{
        width: `${slider}px`,
      }"
    />
    <div
      z-100 h-screen w-2 shrink-0
      cursor-ew-resize
      bg-gray opacity-50
      @mousedown="onMouseDown"
    />
    <div grow />
    <div
      max-w-2xl h-screen p-10
      flex="~ col gap-2" justify-center
    >
      <div flex="~ row gap-2" w-max mx-auto>
        <button
          btn @click="openFileDialog()"
        >
          {{ fileName.length === 0 ? '打开 PDF' : fileName.slice(0, 10) }}
        </button>
        <input
          v-model="translateToken"
          type="text"
          placeholder="翻译令牌"
          input-t text-center
        >
      </div>
      <div v-if="isPdfSelected" overflow-y-scroll>
        <div
          v-for="t, index in sentences"
          :key="t.sentence + index"
        >
          <p my-3>
            {{ t.sentence }}
          </p>
          <p my-3>
            {{ t.translation }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
html {
  --c-bg: #fff;
  --c-scrollbar: #eee;
  --c-scrollbar-hover: #bbb;
}

html.dark {
  --c-bg: #050505;
  --c-scrollbar: #111;
  --c-scrollbar-hover: #222;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar:horizontal {
  height: 6px;
}
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner {
  background: var(--c-bg);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb {
  background: var(--c-scrollbar);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--c-scrollbar-hover);
}

#pdf-viewer::-webkit-scrollbar {
  display: none;
}
</style>
