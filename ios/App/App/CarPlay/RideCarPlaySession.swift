import CarPlay
import Foundation
import MapKit
import UIKit

final class RideCarPlaySession {
    static let shared = RideCarPlaySession()

    weak var plugin: RideCarPlayPlugin?
    private weak var scene: CarPlaySceneDelegate?

    private(set) var isConnected = false
    private(set) var muted = false
    private(set) var latest: RideCarPlaySnapshot?
    private var stopped = false

    private init() {}

    func attach(scene: CarPlaySceneDelegate) {
        self.scene = scene
        isConnected = true
        if let latest, !stopped {
            scene.apply(latest)
        }
        plugin?.emitConnection(connected: true)
    }

    func detach() {
        isConnected = false
        scene = nil
        plugin?.emitConnection(connected: false)
    }

    func start(_ snapshot: RideCarPlaySnapshot) {
        stopped = false
        muted = snapshot.muted
        latest = snapshot
        scene?.apply(snapshot)
    }

    func update(_ snapshot: RideCarPlaySnapshot) {
        guard !stopped else {
            return
        }
        muted = snapshot.muted
        latest = snapshot
        scene?.apply(snapshot)
    }

    func stop() {
        stopped = true
        latest = nil
        RideCarPlaySpeech.shared.cancel()
        scene?.endNavigation()
    }

    func requestStop() {
        plugin?.emitStop()
        stop()
    }

    func toggleMute() {
        muted.toggle()
        if muted {
            RideCarPlaySpeech.shared.cancel()
        }
        if let latest {
            let next = latest.withMute(muted)
            self.latest = next
            scene?.apply(next)
        }
        plugin?.emitMute(muted: muted)
    }

    func recenter() {
        scene?.recenter()
    }
}
