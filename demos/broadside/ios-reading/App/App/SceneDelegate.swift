import UIKit
import Capacitor
import Speech
import AVFoundation

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ReadingViewController()
        window?.makeKeyAndVisible()
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: options)
    }
    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) { SceneDelegateProxy.shared.scene(scene, openURLContexts: contexts) }
    func scene(_ scene: UIScene, continue activity: NSUserActivity) { SceneDelegateProxy.shared.scene(scene, continue: activity) }
    func sceneDidBecomeActive(_ scene: UIScene) { UIApplication.shared.isIdleTimerDisabled = true }
    func sceneWillResignActive(_ scene: UIScene) {
        UIApplication.shared.isIdleTimerDisabled = false
        NotificationCenter.default.post(name: .readingStopped, object: nil)
    }
}
extension Notification.Name { static let readingStopped = Notification.Name("CaptainReaderStopCapture") }
class ReadingViewController: CAPBridgeViewController {
    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ReadingSpeechPlugin())
        webView?.allowsBackForwardNavigationGestures = false
        webView?.isOpaque = true
        webView?.backgroundColor = UIColor(red: 0.04, green: 0.14, blue: 0.18, alpha: 1)
        webView?.scrollView.bounces = false
        #if DEBUG
        // Capability evidence only: no microphone, authorization prompt, audio or transcript.
        if ProcessInfo.processInfo.arguments.contains("--reading-speech-diagnostics") {
            let data: [String: Any] = ["device": UIDevice.current.model, "system": UIDevice.current.systemVersion,
                "preferredLanguages": Locale.preferredLanguages, "locales": ReadingSpeechPlugin.localeCapabilities()]
            if let json = try? JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted, .sortedKeys]),
               let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                try? json.write(to: docs.appendingPathComponent("ReadingSpeechCapabilities.json"), options: .atomic)
            }
        }
        #endif
    }
}

@objc(ReadingSpeechPlugin)
public class ReadingSpeechPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "ReadingSpeechPlugin"
    public let jsName = "ReadingSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise)
    ]
    private let engine = AVAudioEngine()
    private let voice = AVSpeechSynthesizer()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognition: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var token: String?
    private var tapped = false
    private var timer: Timer?
    private var observer: NSObjectProtocol?
    private var lastMeter = Date.distantPast
    public override func load() {
        observer = NotificationCenter.default.addObserver(forName: .readingStopped, object: nil, queue: .main) { [weak self] _ in
            guard let self else { return }
            if let token = self.token { self.notifyListeners("result", data: ["token": token, "kind": "interrupted"]) }
            self.clear(); self.voice.stopSpeaking(at: .immediate)
        }
    }
    deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
    static func localeCapabilities() -> [[String: Any]] {
        let supported = Set(SFSpeechRecognizer.supportedLocales().map { $0.identifier.replacingOccurrences(of: "_", with: "-").lowercased() })
        return ["nb-NO", "en-GB", "en-US"].map { locale in
            let r = SFSpeechRecognizer(locale: Locale(identifier: locale))
            return ["locale": locale, "supported": supported.contains(locale.lowercased()),
                    "onDevice": r?.supportsOnDeviceRecognition ?? false, "available": r?.isAvailable ?? false]
        }
    }
    @objc func capabilities(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["preferredLanguages": Locale.preferredLanguages, "locales": Self.localeCapabilities(),
                          "speechPermission": SFSpeechRecognizer.authorizationStatus().rawValue])
        }
    }
    private func stopInput() {
        if engine.isRunning { engine.stop() }
        if tapped { engine.inputNode.removeTap(onBus: 0); tapped = false }
    }
    private func clear() {
        timer?.invalidate(); timer = nil
        token = nil; stopInput(); request?.endAudio(); recognition?.cancel()
        request = nil; recognition = nil; recognizer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    private func failure(_ message: String) {
        if let token { notifyListeners("result", data: ["token": token, "kind": "error", "message": message]) }
        clear()
    }
    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.clear(); self.voice.stopSpeaking(at: .immediate)
            guard let locale = call.getString("locale"), ["nb-NO", "en-GB", "en-US"].contains(locale),
                  let token = call.getString("token"), let r = SFSpeechRecognizer(locale: Locale(identifier: locale)),
                  r.supportsOnDeviceRecognition, r.isAvailable else {
                call.reject("ON_DEVICE_UNAVAILABLE"); return
            }
            self.token = token
            SFSpeechRecognizer.requestAuthorization { authorization in
                DispatchQueue.main.async {
                    guard self.token == token else { call.reject("CANCELLED"); return }
                    guard authorization == .authorized else { self.clear(); call.reject("SPEECH_PERMISSION"); return }
                    AVAudioApplication.requestRecordPermission { granted in
                        DispatchQueue.main.async {
                            guard self.token == token else { call.reject("CANCELLED"); return }
                            guard granted else { self.clear(); call.reject("MICROPHONE_PERMISSION"); return }
                            guard r.supportsOnDeviceRecognition, r.isAvailable else { self.clear(); call.reject("ON_DEVICE_UNAVAILABLE"); return }
                            do {
                                let session = AVAudioSession.sharedInstance()
                                try session.setCategory(.record, mode: .measurement, options: [])
                                try session.setActive(true)
                                let request = SFSpeechAudioBufferRecognitionRequest()
                                request.requiresOnDeviceRecognition = true
                                request.shouldReportPartialResults = true
                                request.taskHint = .dictation
                                self.request = request; self.recognizer = r
                                let input = self.engine.inputNode
                                let format = input.outputFormat(forBus: 0)
                                guard format.sampleRate > 0, format.channelCount > 0 else { throw NSError(domain: "No microphone input", code: 1) }
                                input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                                    request.append(buffer)
                                    guard let self, let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
                                    let now = Date()
                                    guard now.timeIntervalSince(self.lastMeter) > 0.12 else { return }
                                    self.lastMeter = now
                                    var sum: Float = 0
                                    for i in 0..<Int(buffer.frameLength) { sum += channel[i] * channel[i] }
                                    let level = min(1, sqrt(sum / Float(buffer.frameLength)) * 12)
                                    DispatchQueue.main.async {
                                        if self.token == token { self.notifyListeners("result", data: ["token": token, "kind": "level", "level": level]) }
                                    }
                                }
                                self.tapped = true
                                self.recognition = r.recognitionTask(with: request) { [weak self] result, error in
                                    DispatchQueue.main.async {
                                        guard let self, self.token == token else { return }
                                        if let result {
                                            self.notifyListeners("result", data: ["token": token, "kind": "transcript", "text": result.bestTranscription.formattedString, "final": result.isFinal])
                                            if result.isFinal { self.clear(); return }
                                        }
                                        if error != nil { self.failure("RECOGNITION_UNCERTAIN") }
                                    }
                                }
                                self.engine.prepare(); try self.engine.start()
                                call.resolve()
                            } catch { self.clear(); call.reject("AUDIO_UNAVAILABLE") }
                        }
                    }
                }
            }
        }
    }
    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopInput(); self.request?.endAudio(); self.timer?.invalidate()
            if self.token != nil { self.timer = Timer.scheduledTimer(withTimeInterval: 6, repeats: false) { [weak self] _ in self?.failure("NO_CLEAR_SPEECH") } }
            call.resolve()
        }
    }
    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.clear(); self.voice.stopSpeaking(at: .immediate); call.resolve() }
    }
    @objc func speak(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.clear(); self.voice.stopSpeaking(at: .immediate)
            guard let text = call.getString("text"), text.count <= 1200, let locale = call.getString("locale"),
                  let selectedVoice = AVSpeechSynthesisVoice(language: locale) else { call.reject("VOICE_UNAVAILABLE"); return }
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
                try AVAudioSession.sharedInstance().setActive(true)
                let utterance = AVSpeechUtterance(string: text)
                utterance.voice = selectedVoice; utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.8
                self.voice.delegate = self; self.voice.speak(utterance); call.resolve()
            } catch { call.reject("VOICE_UNAVAILABLE") }
        }
    }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        if token == nil { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    }
}
