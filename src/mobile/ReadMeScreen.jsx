/**
 * Read me — the phone's, not the Mac's.
 *
 * The Mac app's guide (the GUIDE constant in src/components/Settings.jsx)
 * describes agents, MCP servers, model providers and a terminal, none of which
 * exist here. Tony: "About/Read Me obviously need to reference features in
 * this, not the mac app." So this is written from scratch against what the
 * iPhone app actually does today.
 *
 * ⚠️ IT MUST ONLY DESCRIBE WHAT IS BUILT. A guide that promises a feature the
 * app does not have is worse than no guide — that mistake has already been made
 * once in this project and had to be unshipped. When something lands, add it
 * here in the same change.
 */
import React from 'react'

const SECTIONS = [
  {
    title: 'A model on your iPhone',
    body: [
      'Radiant downloads an open AI model onto this phone and runs it here. There is no account, and once a model has finished downloading it works with no signal at all — on a plane, underground, anywhere.',
      'Nothing you type goes anywhere. The conversation happens on the device.'
    ]
  },
  {
    title: 'Choosing a model',
    body: [
      'Bigger models answer better and need more room and more battery. Qwen 3 1.7B is the one to start with on most iPhones; Qwen 3 4B is noticeably smarter but wants a Pro with headroom.',
      'Tap any model to see it in detail, then Download. The logo turns beside its name while it works, and shows how far along it is.'
    ]
  },
  {
    title: 'Stopping a download',
    body: [
      'Tap the turning logo to stop. Whatever has already downloaded stays on the phone, so starting again picks up from there rather than beginning again.',
      'Downloads do not yet continue while the app is in the background — leave Radiant open until one finishes.'
    ]
  },
  {
    title: 'Freeing up space',
    body: [
      'Settings → Models lists everything on the phone and what it weighs. Tap a model to remove it, or remove all of them at once. Removing a model does not delete your conversation.'
    ]
  },
  {
    title: 'Your Mac',
    body: [
      'If you run Radiant on a Mac, this app can connect to it and use the models, agents and sessions there instead of the one on your phone. You will need the access token from the Mac, under Settings → Devices & sharing, and both devices on the same Tailscale network.'
    ]
  },
  {
    title: 'How it looks',
    body: [
      'Settings → Appearance chooses Dark, Medium, Light, or System — Medium is dark without the true black, and System follows your phone. Radiant opens dark unless you change it.',
      'Settings → Color carries the same themes as the Mac app. The color runs through everything: buttons, the glow behind the logo, and the ring while a model downloads. The welcome screen stays dark whichever you pick, because it is built against black.'
    ]
  }
]

export default function ReadMeScreen () {
  return (
    <>
      {SECTIONS.map(s => (
        <section key={s.title} className="rx-readme">
          <h2 className="rx-readme-title">{s.title}</h2>
          {s.body.map((p, i) => <p key={i} className="rx-readme-body">{p}</p>)}
        </section>
      ))}
      <p className="rx-section-footer">
        Radiant is a Templeton&nbsp;Technologies product.
      </p>
    </>
  )
}

export { ReadMeScreen }
