import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

function cssVar (name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function termTheme () {
  const dark = document.documentElement.dataset.mode !== 'light'
  return {
    background: cssVar('--bg-input') || (dark ? '#111' : '#fff'),
    foreground: cssVar('--text'),
    cursor: cssVar('--accent'),
    selectionBackground: cssVar('--accent-dim')
  }
}

export default function Terminal ({ cwd, mode }) {
  const holderRef = useRef(null)
  const termRef = useRef(null)

  useEffect(() => {
    const term = new XTerm({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12.5,
      cursorBlink: true,
      theme: termTheme(),
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(holderRef.current)
    fit.fit()
    termRef.current = term

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/term?cwd=${encodeURIComponent(cwd || '')}`)
    ws.onopen = () => {
      ws.send(`\x00resize:${term.cols},${term.rows}`)
      term.focus()
    }
    ws.onmessage = e => term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data))
    ws.onclose = () => term.write('\r\n\x1b[2m[session ended — reopen the tab for a new shell]\x1b[0m\r\n')
    term.onData(d => { if (ws.readyState === 1) ws.send(d) })

    const onResize = () => {
      fit.fit()
      if (ws.readyState === 1) ws.send(`\x00resize:${term.cols},${term.rows}`)
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(holderRef.current)

    return () => {
      observer.disconnect()
      ws.close()
      term.dispose()
    }
  }, [cwd])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = termTheme()
  }, [mode])

  return <div className='term-wrap' ref={holderRef} />
}
