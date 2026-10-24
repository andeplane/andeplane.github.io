import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GameViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        UIApplication.shared.isIdleTimerDisabled = true
    }

    func sceneWillResignActive(_ scene: UIScene) {
        UIApplication.shared.isIdleTimerDisabled = false
    }
}

// The TypeScript game owns layout and controls; Swift only hosts the WebView.
class GameViewController: CAPBridgeViewController {
    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }

    override func capacitorDidLoad() {
        webView?.allowsBackForwardNavigationGestures = false
        webView?.isOpaque = true
        webView?.backgroundColor = UIColor(red: 16 / 255, green: 46 / 255, blue: 54 / 255, alpha: 1)
        webView?.scrollView.bounces = false
        #if targetEnvironment(simulator)
        // Test fixtures seed valid game saves; the shipping device binary excludes this code.
        if ProcessInfo.processInfo.arguments.contains("--game-qa-fixture"),
           let json = ProcessInfo.processInfo.environment["GAME_QA_FIXTURE"],
           let data = json.data(using: .utf8),
           let fixture = try? JSONSerialization.jsonObject(with: data) as? [String: String],
           let safeData = try? JSONSerialization.data(withJSONObject: fixture),
           let payload = String(data: safeData, encoding: .utf8) {
            let script = """
            (() => { const fixture = \(payload); const marker = fixture['qa.fixture'];
              if (marker && localStorage.getItem('qa.fixture') !== marker)
                for (const [key, value] of Object.entries(fixture)) localStorage.setItem(key, value);
            })();
            """
            webView?.configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
    }
}
