import './bridge.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/mobile/mobile.css'
document.body.classList.add('is-native')
document.documentElement.setAttribute('data-rx-mode', 'dark')
document.documentElement.setAttribute('data-rx-dark', 'true')
const { default: Phone } = await import('../src/mobile/Phone.jsx')
createRoot(document.getElementById('root')).render(<Phone />)
