const { execSync } = require('child_process')

// electron-builder with identity:null leaves the .app bundle only partially
// signed (the inner Electron binary is ad-hoc/linker-signed but the bundle
// isn't sealed), which makes macOS report the downloaded app as "damaged".
// Re-sign the whole bundle ad-hoc so it verifies cleanly; downloaders then get
// the normal "unidentified developer" flow (right-click → Open) instead.
exports.default = async function afterPack (context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  console.log('[afterPack] ad-hoc signing', app)
  execSync(`codesign --force --deep --sign - "${app}"`, { stdio: 'inherit' })
  execSync(`codesign --verify --deep --strict "${app}"`, { stdio: 'inherit' })
}
