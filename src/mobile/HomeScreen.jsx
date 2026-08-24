/**
 * Home — somewhere to arrive, not a list of files to manage.
 *
 * The app used to open onto Models: a catalogue of things to install. Tony:
 * "I feel like theres no Home Screen on this app. it feels wrong." He was
 * right. Nothing greeted you, nothing showed what you had been doing, and
 * starting a conversation meant going through an inventory screen first.
 *
 * So: who you are talking to, what you were saying, and one obvious way on.
 * Models moved to where model management belongs — a screen you visit when you
 * want to change something, not the front door.
 */
import React, { useCallback, useEffect, useState } from 'react'
import usePress from './usePress.js'
import { BrandMark } from './BrandSpinner.jsx'
import { listChats, deleteChat, whenLabel } from './chats.js'

/** Time of day, because a greeting that never changes stops being one. */
function greeting () {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function ChatRow ({ chat, onOpen, onRemove }) {
  const row = usePress(() => onOpen(chat.id), {
    label: `${chat.title}, ${whenLabel(chat.updatedAt)}${chat.modelName ? `, ${chat.modelName}` : ''}`
  })
  // Deleting is its own labelled control, never the row — the same rule the
  // review forced on Settings after a one-tap delete shipped there.
  const del = usePress(() => onRemove(chat), {
    label: `Delete ${chat.title}`, haptic: 'MEDIUM'
  })
  return (
    <div className={'rx-row rx-row-2line' + row.className} {...row.handlers}>
      <div className="rx-row-text">
        <div className="rx-headline">{chat.title}</div>
        <div className="rx-row-blurb">
          {whenLabel(chat.updatedAt)}
          {chat.modelName ? ` · ${chat.modelName}` : ''}
        </div>
      </div>
      <span className={'rx-row-remove' + del.className} {...del.handlers}>Delete</span>
    </div>
  )
}

export default function HomeScreen ({
  activeModel, models = [], onStartChat, onOpenChat, onChooseModel, onConnectMac
}) {
  const [chats, setChats] = useState(() => listChats())
  const refresh = useCallback(() => setChats(listChats()), [])

  // coming back from a conversation should show it at the top, updated
  useEffect(() => {
    const onVis = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const remove = useCallback((chat) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete “${chat.title}”?`)) return
    deleteChat(chat.id)
    refresh()
  }, [refresh])

  const start = usePress(() => onStartChat?.(), {
    label: activeModel ? `New chat with ${activeModel.name}` : 'Choose a model to start',
    disabled: !activeModel
  })
  const choose = usePress(() => onChooseModel?.(), { label: 'Models' })
  const mac = usePress(() => onConnectMac?.(), { label: 'Connect to a Mac' })

  const downloaded = models.filter(m => m?.downloaded)

  return (
    <>
      <div className="rx-home-head">
        <p className="rx-home-greeting">{greeting()}</p>
        {activeModel
          ? (
            <div className="rx-home-model">
              <BrandMark size={26} />
              <div className="rx-home-model-text">
                <div className="rx-headline">{activeModel.name}</div>
                <div className="rx-row-blurb">Ready on this iPhone</div>
              </div>
            </div>
            )
          : (
            <p className="rx-home-empty">
              No model on this iPhone yet. Choose one and it runs here, offline.
            </p>
            )}
      </div>

      <div className="rx-home-actions">
        <button type="button" className={'rx-intro-cta' + start.className} {...start.handlers}>
          New chat
        </button>
        <button type="button" className={'rx-intro-second' + choose.className} {...choose.handlers}>
          {downloaded.length ? 'Models' : 'Choose a model'}
        </button>
      </div>

      {chats.length > 0 && (
        <>
          <h2 className="rx-section-header">Recent</h2>
          <div className="rx-group">
            {chats.map(c => (
              <ChatRow key={c.id} chat={c} onOpen={onOpenChat} onRemove={remove} />
            ))}
          </div>
        </>
      )}

      <h2 className="rx-section-header">Your Mac</h2>
      <div className="rx-group">
        <div className={'rx-row rx-pressable' + mac.className} {...mac.handlers}>
          <div className="rx-row-text"><div className="rx-headline">Connect to a Mac</div></div>
        </div>
      </div>
      <p className="rx-section-footer">
        Reach the models, agents and sessions on your Mac from this phone.
      </p>
    </>
  )
}

export { HomeScreen }
