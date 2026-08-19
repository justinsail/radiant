import React, { useMemo } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

marked.setOptions({
  highlight: (code, lang) => {
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
      return hljs.highlightAuto(code).value
    } catch { return code }
  }
})

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }) => {
  let html
  try {
    html = lang && hljs.getLanguage(lang)
      ? hljs.highlight(text, { language: lang }).value
      : hljs.highlightAuto(text).value
  } catch { html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;') }
  return `<pre><code class="hljs">${html}</code></pre>`
}

export default function Markdown ({ text }) {
  const html = useMemo(() => {
    const raw = marked.parse(text || '', { renderer, breaks: true })
    return DOMPurify.sanitize(raw)
  }, [text])
  return <div className='md' dangerouslySetInnerHTML={{ __html: html }} />
}
