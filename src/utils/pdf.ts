import * as pdfjs from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry'

import type { TextContent, TextItem, TextStyle } from 'pdfjs-dist/types/src/display/api'
import { computed, ref } from 'vue'

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

const renderingTaskCount = ref(0)

export const isRendering = computed(() => renderingTaskCount.value > 0)

export async function renderPdfToCanvas(
  pdfRawData: ArrayBuffer | undefined,
  canvasWarpper: HTMLElement | undefined,
  desiredWidth: number,
) {
  if (!canvasWarpper || !pdfRawData)
    return

  const pdf = await pdfjs.getDocument({
    data: pdfRawData,
  }).promise

  parseSentencesFromPdf(pdf)

  let pageNumber = 1
  canvasWarpper.innerHTML = ''

  while (pageNumber <= pdf.numPages) {
    renderingTaskCount.value++

    const page = await pdf.getPage(pageNumber)

    const viewport = page.getViewport({ scale: 1 })

    const scale = desiredWidth / viewport.width
    const scaledViewport = page.getViewport({ scale })

    const outputScale = window.devicePixelRatio || 1

    const canvas = canvasWarpper.appendChild(document.createElement('canvas'))

    canvas.width = Math.floor(scaledViewport.width * outputScale)
    canvas.height = Math.floor(scaledViewport.height * outputScale)
    canvas.style.width = `${Math.floor(scaledViewport.width)}px`
    canvas.style.height = `${Math.floor(scaledViewport.height)}px`

    const transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0]
      : null

    if (transform) {
      page.render({
        canvasContext: canvas.getContext('2d'),
        transform,
        viewport: scaledViewport,
      }).promise.finally(() => {
        renderingTaskCount.value--
      })
    }

    pageNumber++
  }
}

export const parsedSentences = ref<string[]>()

export async function parseSentencesFromPdf(pdf: pdfjs.PDFDocumentProxy) {
  const textContentPromise = Array.from({ length: pdf.numPages })
    .map(async (_, i) => {
      const page = await pdf.getPage(i + 1)
      const content = await page.getTextContent()
      return content
    })

  const textContents: TextContent[] = await Promise.all(textContentPromise)

  const styles: {
    [x: string]: TextStyle
  } = {}

  textContents.forEach((content) => {
    Object.entries(content.styles).forEach(([key, value]) => {
      styles[key] = value
    })
  })

  const tokenizedText: TextContent = {
    items: textContents.flatMap(content => content.items),
    styles,
  }

  const textItems = tokenizedText.items as TextItem[]

  // 对所有的 textItem 的 height，transform[0]，transform[3] 进行计数
  const heightCount: {
    [x: string]: number
  } = {}
  const transform0Count: {
    [x: string]: number
  } = {}
  const transform3Count: {
    [x: string]: number
  } = {}

  textItems.forEach(({ height, transform }) => {
    if (heightCount[height])
      heightCount[height] += 1

    else
      heightCount[height] = 1

    if (transform0Count[transform[0]])
      transform0Count[transform[0]] += 1

    else
      transform0Count[transform[0]] = 1

    if (transform3Count[transform[3]])
      transform3Count[transform[3]] += 1

    else
      transform3Count[transform[3]] = 1
  })

  // 计算出最大的 height，transform[0]，transform[3]
  const maxHeight = Object.entries(heightCount).reduce((acc, [key, value]) => {
    if (value > acc[1])
      return [key, value]
    else
      return acc
  }, ['', 0])[0]

  const maxTransform0 = Object.entries(transform0Count).reduce((acc, [key, value]) => {
    if (value > acc[1])
      return [key, value]
    else
      return acc
  }, ['', 0])[0]

  const maxTransform3 = Object.entries(transform3Count).reduce((acc, [key, value]) => {
    if (value > acc[1])
      return [key, value]
    else
      return acc
  }, ['', 0])[0]

  // 对所有出现的字体进行计数
  const fontNameCount: Record<string, number> = {}
  for (const textItem of textItems) {
    const fontName = textItem.fontName
    if (fontName in fontNameCount)
      fontNameCount[fontName] += 1
    else
      fontNameCount[fontName] = 1
  }

  // 找到出现最多的字体
  const maxFontName = Object.entries(fontNameCount).reduce((prev, curr) => {
    if (prev[1] > curr[1])
      return prev
    else
      return curr
  })[0]

  const allText = textItems.filter(i => (i.height.toString() === maxHeight || i.transform[0] === maxTransform0 || i.transform[3] === maxTransform3) && i.fontName === maxFontName).map(item => item.str).join(' ')
  // 对 allText 按英语句子进行分割
  const sentences = allText.split(/(?<=[.?!])\s+(?=[a-z])/i)
    .map(i => i.replaceAll('- ', ''))
  // 将形如 [1] 或 [10,11] 的内容去除
    .map(i => i.replace(/\[[0-9]+(,[0-9]+)*\]/g, ''))

  // FIXME: 展示全部句子
  parsedSentences.value = sentences.slice(0, 3)
}
