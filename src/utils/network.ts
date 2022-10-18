import { Body, fetch } from '@tauri-apps/api/http'

export interface DeeplTranslateResult {
  translations: {
    detected_source_language: string
    text: string
  }[]
}

export async function translateFromDeepl(text: string, token: string) {
  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: Body.text(`text=${encodeURI(text)}&target_lang=ZH`),
  })

  const result = await response.data as DeeplTranslateResult
  return result.translations[0].text
}
