import UIKit
import Capacitor
import WebKit

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
    #if DEBUG
    private var smokeTimer: Timer?
    private var smokePoll = 0
    #endif
    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }

    override func capacitorDidLoad() {
        webView?.allowsBackForwardNavigationGestures = false
        webView?.isOpaque = true
        webView?.backgroundColor = UIColor(red: 16 / 255, green: 46 / 255, blue: 54 / 255, alpha: 1)
        webView?.scrollView.bounces = false
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--broadside-smoke-test") {
            startSmokeTest()
        }
        #endif
    }
}

#if DEBUG
extension GameViewController {
    // Opt-in device QA through real menu buttons; normal launches never run it.
    private func startSmokeTest() {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let report = directory.appendingPathComponent("BroadsideSmoke.jsonl")
        try? Data().write(to: report)
        smokeTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            guard let self = self, let view = self.webView else { return }
            self.smokePoll += 1
            view.evaluateJavaScript(#"""
            (() => {
              const c = document.querySelector('#game');
              if (!c || !document.querySelector('#menu-play')) return JSON.stringify({waiting:true});
              const q = window.__broadsideSmoke ??= {stage:0, ticks:0, errors:[]};
              if (!q.hooked) {
                q.hooked = true;
                addEventListener('error', e => q.errors.push(e.message));
                addEventListener('unhandledrejection', e => q.errors.push(String(e.reason)));
              }
              const click = s => document.querySelector(s)?.click();
              const start = () => { click('#menu-play'); click('[data-pack="0"]'); click('[data-level="0"]'); };
              if (q.stage === 0 && c.dataset.state === 'menu') { start(); q.stage = 1; }
              else if ([1,2,4].includes(q.stage) && ['exploring','battle','hold'].includes(c.dataset.state)) {
                if (++q.ticks >= (c.dataset.state === 'hold' ? 8 : 12)) {
                  q.ticks = 0;
                  click(c.dataset.state === 'hold' ? '#hold-back' : '#v-return');
                  if (q.stage === 2) { click('#visit-ship'); q.stage = 3; }
                  else if (q.stage === 4) { q.stage = 5; }
                  else { start(); q.stage++; }
                }
              } else if (q.stage === 3 && c.dataset.state === 'harbour' && ++q.ticks >= 10) {
                q.ticks = 0; click('#cave-back'); start(); q.stage = 4;
              }
              return JSON.stringify({stage:q.stage, ticks:q.ticks, errors:q.errors, ...c.dataset});
            })()
            """#) { result, error in
                let payload = (result as? String) ?? "error: \(String(describing:error))"
                let line = "{\"poll\":\(self.smokePoll),\"result\":\(payload)}\n"
                if let handle = try? FileHandle(forWritingTo: report) {
                    handle.seekToEndOfFile(); handle.write(Data(line.utf8)); try? handle.close()
                }
                print("BroadsideSmoke \(line)")
                if let data = payload.data(using: .utf8),
                   let sample = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let stage = sample["stage"] as? Int {
                    if sample["ticks"] as? Int == 5 {
                        view.takeSnapshot(with: nil) { image, _ in
                            try? image?.pngData()?.write(to: directory.appendingPathComponent("BroadsideSmoke-stage\(stage).png"))
                        }
                    }
                    if stage == 5 {
                        self.smokeTimer?.invalidate(); self.smokeTimer = nil
                    }
                }
            }
        }
    }
}
#endif
