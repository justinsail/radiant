import React, { useMemo, useRef, useEffect } from 'react'
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
  const ref = useRef(null)
  const html = useMemo(() => {
    const raw = marked.parse(text || '', { renderer, breaks: true })
    return DOMPurify.sanitize(raw)
  }, [text])

  // add a copy button to every code block after render
  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll('pre').forEach(pre => {
      if (pre.querySelector('.code-copy')) return
      const btn = document.createElement('button')
      btn.className = 'code-copy'
      btn.type = 'button'
      btn.textContent = 'Copy'
      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.innerText || pre.innerText
        let ok = false
        try { await navigator.clipboard.writeText(code); ok = true } catch {}
        if (ok) {
          btn.textContent = 'Copied'
          setTimeout(() => { btn.textContent = 'Copy' }, 1400)
        } else {
          // clipboard blocked — select the code so the user can just press ⌘C
          const range = document.createRange()
          range.selectNodeContents(pre.querySelector('code') || pre)
          const sel = window.getSelection()
          sel.removeAllRanges(); sel.addRange(range)
          btn.textContent = 'Press ⌘C'
          setTimeout(() => { btn.textContent = 'Copy' }, 1800)
        }
      })
      pre.appendChild(btn)
    })
    // open links in the external browser — Electron denies in-window navigation,
    // so a plain <a> click does nothing. Intercept and open via the OS.
    const onLinkClick = e => {
      const a = e.target.closest('a[href]')
      if (!a || !root.contains(a)) return
      const href = a.getAttribute('href') || ''
      if (!href || href.startsWith('#')) return
      e.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    }
    root.addEventListener('click', onLinkClick)
    return () => root.removeEventListener('click', onLinkClick)
  }, [html])

  return <div className='md' ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
}
