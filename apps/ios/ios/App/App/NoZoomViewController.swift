import UIKit
import Capacitor

/// The app's web view, with pinch-zoom taken away.
///
/// ⚠️ WITHOUT THIS THE APP CAN BE ZOOMED INTO AND NOT BACK OUT OF. Tony: "I
/// swiped somewhere and somehow expanded the screen, where everything got large
/// and i got scroll bars. i couldn't revert until i swiped up on the app." That
/// is WKWebView's own pinch gesture: a stray two-finger touch scales the whole
/// document, iOS remembers the scale, and there is no control anywhere in
/// Radiant to undo it — killing the app is the only way out. A native app cannot
/// do this, so it reads as the app breaking.
///
/// ⚠️ THE VIEWPORT META IS NOT ENOUGH ON ITS OWN. iOS honours Settings →
/// Accessibility → Zoom and Safari's "allow zoom" over `user-scalable=no`, so
/// the meta tag is a hint and this is the guarantee. Both are set.
///
/// ⚠️ AND THIS IS NOT AN ACCESSIBILITY REGRESSION. Pinch-zooming a UI that
/// reflows is not how iOS scales text — Dynamic Type is, and Radiant honours it
/// AND adds its own Text size control on top. What is removed is an unlabelled
/// gesture with no way back, not a way to read the app larger.
class NoZoomViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        guard let scroll = webView?.scrollView else { return }
        scroll.pinchGestureRecognizer?.isEnabled = false
        scroll.bouncesZoom = false
        scroll.minimumZoomScale = 1.0
        scroll.maximumZoomScale = 1.0
    }
}
