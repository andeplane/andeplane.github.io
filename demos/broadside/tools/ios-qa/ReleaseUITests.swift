import XCTest

final class ReleaseUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }
    func game(_ bundle: String, fixture: String) throws -> XCUIApplication {
        var record = try JSONSerialization.jsonObject(with: Data(fixture.utf8)) as! [String: String]
        record["qa.fixture"] = (record["qa.fixture"] ?? "qa") + ":" + UUID().uuidString
        let app = XCUIApplication(bundleIdentifier: bundle)
        app.launchArguments = ["--game-qa-fixture"]
        app.launchEnvironment["GAME_QA_FIXTURE"] = String(data: try JSONSerialization.data(withJSONObject: record), encoding: .utf8)!
        app.launch()
        let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Play' OR label BEGINSWITH 'Continue'")).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 60), app.debugDescription)
        return app
    }
    func button(_ app: XCUIApplication, _ prefix: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "(elementType == %d OR elementType == %d) AND label BEGINSWITH %@", XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue, prefix)).firstMatch
    }
    func tap(_ app: XCUIApplication, _ prefix: String) {
        if prefix != "Keep sailing" && button(app,"Keep sailing").exists {
            button(app,"Keep sailing").tap()
            Thread.sleep(forTimeInterval: 1)
        }
        let target = button(app, prefix)
        XCTAssertTrue(target.waitForExistence(timeout: 30), "Missing \(prefix)\n\(app.debugDescription)")
        target.tap()
        Thread.sleep(forTimeInterval: 1.2)
    }
    func capture(_ name: String, app: XCUIApplication) {
        // Wait for UIKit rotation and the WKWebView compositor to present the new frame.
        Thread.sleep(forTimeInterval: 2)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
        print("GAME_SCREEN \(name)\n\(app.debugDescription)\nGAME_SCREEN_END")
    }
    func waitEnabled(_ element: XCUIElement, seconds: TimeInterval = 30) {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: seconds), .completed)
    }
    func testA_BroadsideMenusAndVoyage() throws {
        let app = try game("com.andeplane.broadside", fixture: Fixtures.broadside)
        capture("broadside-01-home-portrait", app: app)
        tap(app,"Settings"); tap(app,"Privacy & support")
        XCTAssertTrue(button(app,"Close privacy and support").isHittable)
        capture("broadside-privacy-portrait",app:app)
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("broadside-privacy-landscape",app:app)
        tap(app,"Close privacy and support"); XCUIDevice.shared.orientation = .portrait
        tap(app,"Back to previous menu"); tap(app,"Play")
        capture("broadside-02-worlds-portrait",app:app)
        tap(app,"First sails, world 1")
        capture("broadside-03-islands-portrait",app:app)
        tap(app,"Back to previous menu")
        tap(app,"Open world")
        XCTAssertTrue(button(app,"Pause voyage").waitForExistence(timeout:45))
        let loading = app.staticTexts["Hoisting the sails…"]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: loading)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 90), .completed)
        if button(app,"Keep sailing").exists { tap(app,"Keep sailing") }
        capture("broadside-04-voyage-portrait",app:app)
        tap(app,"Switch to captain view")
        capture("broadside-captain-view-portrait",app:app)
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("broadside-05-voyage-landscape",app:app)
        tap(app,"Pause voyage"); capture("broadside-pause-landscape",app:app)
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertTrue(button(app,"Keep sailing").waitForExistence(timeout:15))
        tap(app,"Keep sailing")
        capture("broadside-resumed-landscape",app:app)
    }
    func testB_BroadsideBoardingAndTreasure() throws {
        let app = try game("com.andeplane.broadside",fixture:Fixtures.broadside)
        tap(app,"Play");tap(app,"Your ship details")
        capture("broadside-ship-dialog",app:app);tap(app,"Board the ship")
        XCTAssertTrue(button(app,"Back to menu").waitForExistence(timeout:45))
        capture("broadside-06-deck-portrait",app:app)
        let deckPad = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Walk on the Black Pearl")).firstMatch
        XCTAssertTrue(deckPad.waitForExistence(timeout: 20))
        deckPad.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).press(forDuration: 2.3)
        capture("broadside-walked-into-gold-room", app: app)
        if button(app,"Jump").exists { tap(app,"Jump") }
        capture("broadside-deck-jump",app:app)
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("broadside-07-deck-landscape",app:app)
        tap(app,"Back to menu");XCUIDevice.shared.orientation = .portrait
        tap(app,"Visit treasure cave")
        XCTAssertTrue(button(app,"Back to menu").waitForExistence(timeout:45))
        capture("broadside-cave-entrance",app:app)
        let pad = app.descendants(matching:.any).matching(NSPredicate(format:"label == %@","Move around the cave")).firstMatch
        XCTAssertTrue(pad.exists)
        pad.coordinate(withNormalizedOffset:CGVector(dx:0.08,dy:0.5)).press(forDuration:2.2)
        pad.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.08)).press(forDuration:2.9)
        capture("broadside-08-cave-gems-portrait",app:app)
        if button(app,"Inspect ·").exists && button(app,"Inspect ·").isHittable {
            tap(app,"Inspect ·");capture("broadside-09-gold-inspection",app:app)
            tap(app,"‹ Keep exploring")
        }
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("broadside-10-cave-landscape",app:app)
        tap(app,"Back to menu")
    }
    func testC_CalculusMathAndUnloading() throws {
        let app = try game("com.andeplane.captaincalculus",fixture:Fixtures.calculus)
        capture("calculus-01-home-portrait",app:app)
        tap(app,"Continue")
        XCTAssertTrue(button(app,"Check answer").waitForExistence(timeout:20))
        XCTAssertFalse(button(app,"Check answer").isEnabled)
        capture("calculus-04-question-portrait",app:app)
        tap(app,"A little help");capture("calculus-hint-portrait",app:app)
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("calculus-05-question-landscape",app:app)
        tap(app,"Hide hint");XCUIDevice.shared.orientation = .portrait
        app.buttons["0"].tap();tap(app,"Check answer")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label BEGINSWITH %@","Not quite.")).firstMatch.waitForExistence(timeout:10))
        capture("calculus-wrong-answer",app:app)
        for (i,answer) in Fixtures.answers.enumerated() {
            for digit in String(answer) { app.buttons[String(digit)].tap() }
            tap(app,"Check answer")
            if i<Fixtures.answers.count-1 { tap(app,"Next problem") }
        }
        capture("calculus-900-gold-earned",app:app)
        tap(app,"Open your chest")
        XCTAssertTrue(button(app,"Return to cave").waitForExistence(timeout:45))
        waitEnabled(button(app,"Explore next island"),seconds:30)
        capture("calculus-06-earned-chests",app:app)
        tap(app,"Return to cave")
        app.terminate();app.launch()
        XCTAssertTrue(button(app,"Your ship 2 chests aboard").waitForExistence(timeout:45),app.debugDescription)
        XCTAssertTrue(button(app,"Your cave 10,000 gold saved").exists)
        capture("calculus-interrupted-unload-safe",app:app)
        tap(app,"Your ship 2 chests aboard");tap(app,"Return to cave")
        XCTAssertTrue(button(app,"Explore your cave").waitForExistence(timeout:90),app.debugDescription)
        XCTAssertTrue(button(app,"Cave, 11,900 gold banked").exists,app.debugDescription)
        capture("calculus-07-unloaded-gold",app:app)
        tap(app,"Explore your cave")
        capture("calculus-08-cave-reserve-portrait",app:app)
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("calculus-cave-reserve-landscape",app:app)
        app.terminate();XCUIDevice.shared.orientation = .portrait;app.launch()
        XCTAssertTrue(button(app,"Your cave 11,900 gold saved").waitForExistence(timeout:45),app.debugDescription)
        capture("calculus-relaunch-saved-gold",app:app)
    }
    func testE_FullScreenRotationCapture() throws {
        let broadside = try game("com.andeplane.broadside", fixture: Fixtures.broadside)
        tap(broadside,"Settings"); tap(broadside,"Privacy & support")
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("broadside-full-screen-privacy-landscape", app: broadside)
        tap(broadside,"Close privacy and support")
        tap(broadside,"Back to previous menu"); tap(broadside,"Your cave")
        XCTAssertTrue(button(broadside,"Back to menu").waitForExistence(timeout:45))
        capture("broadside-full-screen-cave-landscape", app: broadside)
        broadside.terminate()
        XCUIDevice.shared.orientation = .portrait
        let calculus = try game("com.andeplane.captaincalculus", fixture: Fixtures.calculus)
        tap(calculus,"Continue")
        XCTAssertTrue(button(calculus,"Check answer").waitForExistence(timeout:20))
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("calculus-full-screen-question-landscape", app: calculus)
        tap(calculus,"Cave,")
        XCTAssertTrue(button(calculus,"Back to problem").waitForExistence(timeout:45))
        capture("calculus-full-screen-cave-landscape", app: calculus)
        calculus.terminate()
    }
    func testF_StoreScreenshots() throws {
        let broadside = try game("com.andeplane.broadside", fixture: Fixtures.broadside)
        capture("broadside-store-01-home", app: broadside)
        tap(broadside,"Play"); capture("broadside-store-02-worlds", app: broadside)
        tap(broadside,"Your ship details"); tap(broadside,"Board the ship")
        XCTAssertTrue(button(broadside,"Back to menu").waitForExistence(timeout:45))
        capture("broadside-store-03-deck", app: broadside)
        let pad = broadside.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Walk on the Black Pearl")).firstMatch
        XCTAssertTrue(pad.exists)
        pad.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).press(forDuration:2.3)
        capture("broadside-store-04-treasure-room", app: broadside)
        tap(broadside,"Back to menu"); tap(broadside,"Visit treasure cave")
        XCTAssertTrue(button(broadside,"Back to menu").waitForExistence(timeout:45))
        capture("broadside-store-05-cave", app: broadside)
        broadside.terminate()
        let calculus = try game("com.andeplane.captaincalculus",fixture:Fixtures.calculus)
        tap(calculus,"Choose another level"); capture("calculus-store-01-worlds",app:calculus)
        tap(calculus,"Addition: Emerald Archipelago")
        capture("calculus-store-02-difficulty",app:calculus)
        calculus.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.57)).tap()
        XCTAssertTrue(button(calculus,"Find my current island").waitForExistence(timeout:15))
        capture("calculus-store-03-islands",app:calculus)
        tap(calculus,"Play level 12")
        XCTAssertTrue(button(calculus,"Check answer").waitForExistence(timeout:20))
        capture("calculus-store-04-question",app:calculus)
        tap(calculus,"Ship,")
        XCTAssertTrue(button(calculus,"Return to cave").waitForExistence(timeout:45))
        waitEnabled(button(calculus,"Return to cave"),seconds:30)
        capture("calculus-store-05-treasure",app:calculus)
        calculus.terminate()
    }
    func testD_CalculusGuideAndMaps() throws {
        let app = try game("com.andeplane.captaincalculus",fixture:Fixtures.calculus)
        tap(app,"How to play");tap(app,"Privacy & support")
        capture("calculus-privacy-portrait",app:app)
        tap(app,"Close privacy and support");tap(app,"Back to menu")
        tap(app,"Choose another level")
        capture("calculus-02-operators-portrait",app:app)
        tap(app,"Addition: Emerald Archipelago")
        capture("calculus-difficulty-map",app:app)
        let pack = button(app,"Up to 10:")
        XCTAssertTrue(pack.waitForExistence(timeout: 20))
        // Native AX merges the transformed map card with its offscreen decorations.
        // Tap its visible label using the map screenshot coordinates on the phone.
        let tablet = app.windows.firstMatch.frame.width > 700
        app.coordinate(withNormalizedOffset: CGVector(dx: tablet ? 0.35 : 0.5, dy: tablet ? 0.60 : 0.57)).tap()
        Thread.sleep(forTimeInterval: 1.2)
        capture("calculus-03-endless-islands",app:app)
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("calculus-levels-landscape",app:app)
        tap(app,"Find my current island")
        capture("calculus-levels-recentered",app:app)
    }
}

enum Fixtures {
    static let broadside = String(data: Data(base64Encoded: "eyJxYS5maXh0dXJlIjoiYnJvYWRzaWRlLXN0b3JlLTIwMjYxMDI0LXYxIiwiYnJvYWRzaWRlLnYxIjoie1wiZmlzaGluZ1wiOntcImZpc2hcIjowLFwiY2hlc3RzXCI6W119LFwiY2FtcGFpZ25WZXJzaW9uXCI6MixcImJlc3RcIjowLFwiYWR2ZW50dXJlc1wiOjAsXCJrZWVwc2FrZXNcIjpbXSxcInBhaW50XCI6XCIjZmZmM2QwXCIsXCJ2b3lhZ2VzXCI6e1wiMFwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjFcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIyXCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiM1wiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjRcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCI1XCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiNlwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjdcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCI4XCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiOVwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjEwXCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMTFcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIxMlwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjEzXCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMTRcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIxNVwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjE2XCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMTdcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIxOFwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjE5XCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMjBcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIyMVwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjIyXCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMjNcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIyNFwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjI1XCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMjZcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIyN1wiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjI4XCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMjlcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIzMFwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjMxXCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMzJcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIzM1wiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjM0XCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMzVcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIzNlwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfSxcIjM3XCI6e1wic3RhcnNcIjozLFwiZ2Vtc1wiOjN9LFwiMzhcIjp7XCJzdGFyc1wiOjMsXCJnZW1zXCI6M30sXCIzOVwiOntcInN0YXJzXCI6MyxcImdlbXNcIjozfX0sXCJyZWxpY3NcIjpbMiw1LDgsMTFdLFwiY2FyZ29cIjpbXSxcImNhcmdvUmVsaWNzXCI6W119In0=")!, encoding: .utf8)!
    static let calculus = String(data: Data(base64Encoded: "eyJxYS5maXh0dXJlIjoiY2FsY3VsdXMtc3RvcmUtMjAyNjEwMjQtdjIiLCJicm9hZHNpZGUubWF0aC52MSI6IntcInZlcnNpb25cIjo0LFwic29sdmVkXCI6MTEwLFwiY2hlc3RzXCI6MTEsXCJjYXJnb1wiOlt7XCJpZFwiOjEsXCJvcGVyYXRvclwiOlwiYWRkXCIsXCJnb2xkXCI6MTAwMCxcImRlbGl2ZXJlZFwiOnRydWV9LHtcImlkXCI6MixcIm9wZXJhdG9yXCI6XCJhZGRcIixcImdvbGRcIjoxMDAwLFwiZGVsaXZlcmVkXCI6dHJ1ZX0se1wiaWRcIjozLFwib3BlcmF0b3JcIjpcImFkZFwiLFwiZ29sZFwiOjEwMDAsXCJkZWxpdmVyZWRcIjp0cnVlfSx7XCJpZFwiOjQsXCJvcGVyYXRvclwiOlwiYWRkXCIsXCJnb2xkXCI6MTAwMCxcImRlbGl2ZXJlZFwiOnRydWV9LHtcImlkXCI6NSxcIm9wZXJhdG9yXCI6XCJhZGRcIixcImdvbGRcIjoxMDAwLFwiZGVsaXZlcmVkXCI6dHJ1ZX0se1wiaWRcIjo2LFwib3BlcmF0b3JcIjpcImFkZFwiLFwiZ29sZFwiOjEwMDAsXCJkZWxpdmVyZWRcIjp0cnVlfSx7XCJpZFwiOjcsXCJvcGVyYXRvclwiOlwiYWRkXCIsXCJnb2xkXCI6MTAwMCxcImRlbGl2ZXJlZFwiOnRydWV9LHtcImlkXCI6OCxcIm9wZXJhdG9yXCI6XCJhZGRcIixcImdvbGRcIjoxMDAwLFwiZGVsaXZlcmVkXCI6dHJ1ZX0se1wiaWRcIjo5LFwib3BlcmF0b3JcIjpcImFkZFwiLFwiZ29sZFwiOjEwMDAsXCJkZWxpdmVyZWRcIjp0cnVlfSx7XCJpZFwiOjEwLFwib3BlcmF0b3JcIjpcImFkZFwiLFwiZ29sZFwiOjEwMDAsXCJkZWxpdmVyZWRcIjp0cnVlfSx7XCJpZFwiOjExLFwib3BlcmF0b3JcIjpcImFkZFwiLFwiZ29sZFwiOjEwMDAsXCJkZWxpdmVyZWRcIjpmYWxzZX1dLFwib3BlcmF0b3JcIjpcImFkZFwiLFwicGFja1wiOlwiYWRkLTEwXCIsXCJiYW5rc1wiOntcImFkZFwiOjEwMDAwLFwic3VidHJhY3RcIjowLFwibXVsdGlwbHlcIjowLFwiZGl2aWRlXCI6MH0sXCJ0cmFja3NcIjp7XCJhZGQtMTBcIjp7XCJjbGVhcmVkXCI6MTEsXCJzdGFyc1wiOntcIjFcIjozLFwiMlwiOjMsXCIzXCI6MyxcIjRcIjozLFwiNVwiOjMsXCI2XCI6MyxcIjdcIjozLFwiOFwiOjMsXCI5XCI6MyxcIjEwXCI6MyxcIjExXCI6M30sXCJydW5zXCI6e1wiMTJcIjp7XCJsZXZlbFwiOjEyLFwic2VlZFwiOjEyMzQsXCJzb2x2ZWRcIjowLFwibWlzdGFrZXNcIjowLFwicHJvYmxlbU1pc3Rha2VzXCI6MCxcImVhcm5lZEdvbGRcIjowLFwicXVlc3Rpb25TZXRcIjoyfX19fX0ifQ==")!, encoding: .utf8)!
    static let answers: [Int] = [5,10,4,8,7,9,10,9,8,9]
}
