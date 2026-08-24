/**
 * ChatScreen — the shell's adapter around MobileChat.
 *
 * MobileChat owns the transcript, the token stream and its own chrome (the
 * two-line title, the composer, the menu), so the shell renders it bare: the
 * chat route is the one screen that does not get a shell nav bar, because a
 * pinned composer cannot live inside somebody else's scroll view.
 *
 * What is left for this file is what the shell, not the transcript, has an
 * opinion about: where the conversation is persisted, and what Back means.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import MobileChat from './MobileChat.jsx'

// The shell's launch-into-chat check scans for a key matching
// /^(rx|radiant)\..*(chat|conversation|transcript)/ — this is that key.
const KEY = 'rx.chat.transcript'

function load () {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? JSON.parse(raw) : null
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

function save (messages) {
  try {
    if (!messages.length) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(messages.slice(-40)))
  } catch { /* private mode: the conversation just does not outlive the run */ }
}

export default function ChatScreen ({ nav, model, onModelInfo }) {
  const [initial] = useState(load)
  const [nonce, setNonce] = useState(0)

  const onMessagesChange = useCallback((messages) => { save(messages) }, [])

  const onDeleteConversation = useCallback(() => {
    save([])
    setNonce(n => n + 1)
  }, [])

  // The shell's ellipsis menu is a fallback for the bar it does not draw here;
  // MobileChat draws its own. Honor the events anyway so both paths agree.
  useEffect(() => {
    const onAction = (e) => {
      if (e?.detail?.action === 'delete' || e?.detail?.action === 'new') onDeleteConversation()
    }
    window.addEventListener('rx:chat-action', onAction)
    return () => window.removeEventListener('rx:chat-action', onAction)
  }, [onDeleteConversation])

  const back = useCallback(() => nav?.pop?.(), [nav])
  const info = useMemo(() => () => onModelInfo?.(model), [onModelInfo, model])

  return (
    <MobileChat
      key={nonce}
      model={model}
      onBack={back}
      onModelInfo={info}
      initialMessages={nonce === 0 ? initial : []}
      onMessagesChange={onMessagesChange}
      onDeleteConversation={onDeleteConversation}
    />
  )
}

export { ChatScreen }
