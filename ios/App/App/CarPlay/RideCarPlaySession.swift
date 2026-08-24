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

    private init() {}

    func attach(scene: CarPlaySceneDelegate) {
        self.scene = scene
        isConnected = true
        if let latest {
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
        muted = snapshot.muted
        latest = snapshot
        scene?.apply(snapshot)
    }

    func update(_ snapshot: RideCarPlaySnapshot) {
        muted = snapshot.muted
        latest = snapshot
        scene?.apply(snapshot)
    }

    func stop() {
        latest = nil
        RideCarPlaySpeech.shared.cancel()
        scene?.endNavigation()
    }

    func toggleMute() {
        muted.toggle()
        if muted {
            RideCarPlaySpeech.shared.cancel()
        }
        if var latest {
            latest = RideCarPlaySnapshot(
                coordinates: latest.coordinates,
                userLocation: latest.userLocation,
                headingDeg: latest.headingDeg,
                remainingDistanceKm: latest.remainingDistanceKm,
                remainingDurationMinutes: latest.remainingDurationMinutes,
                muted: muted,
                lowAccuracy: latest.lowAccuracy,
                maneuver: latest.maneuver,
                speakText: nil
            )
            self.latest = latest
            scene?.apply(latest)
        }
        plugin?.emitMute(muted: muted)
    }

    func recenter() {
        scene?.recenter()
    }
}
