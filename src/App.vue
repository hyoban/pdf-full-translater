<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useDark, useFileSystemAccess, useWindowSize } from '@vueuse/core'

import { readBinaryFile } from '@tauri-apps/api/fs'
import { BaseDirectory } from '@tauri-apps/api/path'

import { translateFromDeepl } from './utils/network'
import { parseSentencesFromPdf, renderPdfToCanvas } from './utils/pdf'

const isDark = useDark()

const isPdfSelected = ref(false)

const { height } = useWindowSize()
const pdfCanvasSize = reactive({ width: 0, height: 0 })
const actualCanvasSize = computed(() => {
  const ratio = pdfCanvasSize.height / pdfCanvasSize.width

  if (isNaN(ratio))
    return { width: 0, height: 0 }

  return {
    height: height.value,
    width: height.value / ratio,
  }
})

const { data, fileName, open } = useFileSystemAccess({
  dataType: 'ArrayBuffer',
  types: [{
    description: 'Pdf files',
    accept: {
      'application/pdf': ['.pdf'],
    },
  }],
})

const parsedSentences = ref<string[]>()
const translatedSentences = ref<string[]>()
const translateToken = ref('')

const sentences = computed(() => {
  if (!parsedSentences.value)
    return []

  return parsedSentences.value.map((sentence, index) => ({
    sentence,
    translation: translatedSentences.value?.[index] ?? '',
  }))
})

watch(parsedSentences, async () => {
  if (!parsedSentences.value || parsedSentences.value.length === 0)
    return
  if (!translateToken.value) {
    // eslint-disable-next-line no-alert
    alert('请输入翻译令牌')
    return
  }

  translatedSentences.value = await Promise.all(
    parsedSentences.value.map(i => translateFromDeepl(i, translateToken.value)),
  )
})

const generate = async () => {
  parsedSentences.value = (await parseSentencesFromPdf(
    data.value as ArrayBuffer,
  )).slice(0, 3)
}

const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
  // generate()
})

watch(isDark, async () => {
  if (!isPdfSelected.value) {
    const welcomePdf = await readBinaryFile(`pdfs/example-${isDark.value ? 'dark' : 'light'}.pdf`, { dir: BaseDirectory.Resource })
    data.value = welcomePdf
  }
}, { immediate: true })

watch(data, async () => {
  if (isMounted.value) {
    renderPdfToCanvas(
      data.value as ArrayBuffer,
      document.getElementById('pdf-preview') ! as HTMLCanvasElement,
      1,
      (w, h) => {
        pdfCanvasSize.width = w
        pdfCanvasSize.height = h
      },
    )
  }
  if (isPdfSelected.value)
    await generate()
})
</script>

<template>
  <div flex="~ row" min-h-screen min-w-screen justify-between items-center>
    <canvas
      id="pdf-preview"
      ref="el"
      :style="{
        width: `${actualCanvasSize.width}px`,
        height: `${actualCanvasSize.height}px`,
      }"
    />
    <div :class="fileName ? 'mx-5' : 'mx-20'" h-screen flex="~ col gap-2" justify-center>
      <div v-for="t in sentences" :key="t.sentence" overflow-y-auto>
        <p my-3>
          {{ t.sentence }}
        </p>
        <p my-3>
          {{ t.translation }}
        </p>
      </div>
      <div flex="~ col gap-2" w-max mx-auto>
        <button
          btn @click="() => {
            open()
            isPdfSelected = true
          }"
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
    </div>
  </div>
</template>
