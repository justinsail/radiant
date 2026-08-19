import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import '@xterm/xterm/css/xterm.css'
import 'highlight.js/styles/atom-one-dark.css'

createRoot(document.getElementById('root')).render(<App />)
