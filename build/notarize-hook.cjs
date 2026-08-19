const { notarize } = require('@electron/notarize')
const { execSync } = require('child_process')

// Notarize + staple the app DURING the build (afterSign), before electron-builder
// makes the dmg/zip and the latest-mac.yml auto-update metadata — so the update
// artifacts hash the final notarized app. Credentials come from the developer's
// "radiant" notarytool keychain profile (never in the repo).
exports.default = async function afterSign (context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.SKIP_NOTARIZE === '1') { console.log('[notarize] skipped'); return }
  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`
  console.log('[notarize] submitting', appPath)
  await notarize({ tool: 'notarytool', appPath, keychainProfile: 'radiant' })
  console.log('[notarize] stapling')
  execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' })
  console.log('[notarize] done')
}
