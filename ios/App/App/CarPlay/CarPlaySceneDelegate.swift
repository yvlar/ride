import CarPlay
import MapKit
import UIKit

final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate, CPMapTemplateDelegate {
    private var interfaceController: CPInterfaceController?
    private var mapTemplate: CPMapTemplate?
    private var mapViewController: RideCarPlayMapViewController?
    private var navigationSession: CPNavigationSession?
    private var currentTrip: CPTrip?
    private var currentManeuver: CPManeuver?

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController,
        to window: CPWindow
    ) {
        connect(interfaceController: interfaceController, window: window)
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnect interfaceController: CPInterfaceController,
        from window: CPWindow
    ) {
        disconnect()
    }

    func apply(_ snapshot: RideCarPlaySnapshot) {
        mapViewController?.apply(snapshot)
        refreshButtons(muted: snapshot.muted)
        if snapshot.muted {
            RideCarPlaySpeech.shared.cancel()
        } else if let text = snapshot.speakText {
            RideCarPlaySpeech.shared.speak(text)
        }
        updateNavigation(snapshot)
    }

    func recenter() {
        mapViewController?.recenter(RideCarPlaySession.shared.latest)
    }

    func endNavigation() {
        navigationSession?.cancelTrip()
        navigationSession = nil
        currentTrip = nil
        currentManeuver = nil
        mapViewController?.clear()
        RideCarPlaySpeech.shared.cancel()
    }

    func mapTemplate(_ mapTemplate: CPMapTemplate, startedTrip trip: CPTrip, using routeChoice: CPRouteChoice) {
        navigationSession = mapTemplate.startNavigationSession(for: trip)
        currentTrip = trip
        if let latest = RideCarPlaySession.shared.latest {
            updateNavigation(latest)
        }
    }

    func mapTemplateDidBeginPanGesture(_ mapTemplate: CPMapTemplate) {
        mapViewController?.stopFollowing()
        mapTemplate.showPanningInterface(animated: true)
    }

    private func connect(interfaceController: CPInterfaceController, window: CPWindow) {
        self.interfaceController = interfaceController
        let mapViewController = RideCarPlayMapViewController()
        self.mapViewController = mapViewController
        window.rootViewController = mapViewController

        let mapTemplate = CPMapTemplate()
        mapTemplate.mapDelegate = self
        mapTemplate.automaticallyHidesNavigationBar = false
        self.mapTemplate = mapTemplate
        refreshButtons(muted: RideCarPlaySession.shared.muted)
        interfaceController.setRootTemplate(mapTemplate, animated: false) { _, _ in }
        RideCarPlaySession.shared.attach(scene: self)
    }

    private func disconnect() {
        endNavigation()
        RideCarPlaySession.shared.detach()
        interfaceController = nil
        mapTemplate = nil
        mapViewController = nil
    }

    private func refreshButtons(muted: Bool) {
        guard let mapTemplate else {
            return
        }
        let mute = CPBarButton(title: muted ? "Son" : "Muet") { _ in
            RideCarPlaySession.shared.toggleMute()
        }
        mapTemplate.trailingNavigationBarButtons = [mute]

        let recenter = CPMapButton { [weak self] _ in
            self?.recenter()
        }
        recenter.image = UIImage(systemName: "location.fill")
        mapTemplate.mapButtons = [recenter]
    }

    private func updateNavigation(_ snapshot: RideCarPlaySnapshot) {
        guard let mapTemplate else {
            return
        }
        let trip = currentTrip ?? makeTrip(from: snapshot)
        currentTrip = trip
        if navigationSession == nil {
            navigationSession = mapTemplate.startNavigationSession(for: trip)
        }
        guard let navigationSession, let maneuverInfo = snapshot.maneuver else {
            updateTripEstimates(snapshot, on: mapTemplate, trip: trip)
            return
        }
        let maneuver = makeManeuver(maneuverInfo, remainingMinutes: snapshot.remainingDurationMinutes)
        currentManeuver = maneuver
        navigationSession.upcomingManeuvers = [maneuver]
        let maneuverEstimates = CPTravelEstimates(
            distanceRemaining: Measurement(value: max(maneuverInfo.distanceToManeuverM, 0), unit: .meters),
            timeRemaining: timeRemaining(distanceM: maneuverInfo.distanceToManeuverM, snapshot: snapshot)
        )
        navigationSession.updateEstimates(maneuverEstimates, for: maneuver)
        updateTripEstimates(snapshot, on: mapTemplate, trip: trip)
    }

    private func updateTripEstimates(
        _ snapshot: RideCarPlaySnapshot,
        on mapTemplate: CPMapTemplate,
        trip: CPTrip
    ) {
        let estimates = CPTravelEstimates(
            distanceRemaining: Measurement(value: max(snapshot.remainingDistanceKm, 0), unit: .kilometers),
            timeRemaining: max(snapshot.remainingDurationMinutes, 0) * 60
        )
        mapTemplate.update(estimates, for: trip)
    }

    private func makeTrip(from snapshot: RideCarPlaySnapshot) -> CPTrip {
        let originCoordinate = snapshot.coordinates.first.map {
            CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
        } ?? CLLocationCoordinate2D()
        let destinationCoordinate = snapshot.coordinates.last.map {
            CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
        } ?? originCoordinate
        let origin = MKMapItem(placemark: MKPlacemark(coordinate: originCoordinate))
        origin.name = "Départ"
        let destination = MKMapItem(placemark: MKPlacemark(coordinate: destinationCoordinate))
        destination.name = snapshot.maneuver?.roadLabel ?? "Arrivée"
        let choice = CPRouteChoice(
            summaryVariants: ["Ride"],
            additionalInformationVariants: ["Navigation moto"],
            selectionSummaryVariants: ["Ride"]
        )
        return CPTrip(origin: origin, destination: destination, routeChoices: [choice])
    }

    private func makeManeuver(_ maneuver: RideCarPlayManeuver, remainingMinutes: Double) -> CPManeuver {
        let item = CPManeuver()
        var instructions = [maneuver.instruction]
        if let road = maneuver.roadLabel, !instructions.contains(where: { $0.contains(road) }) {
            instructions.append(road)
        }
        item.instructionVariants = instructions
        item.symbolImage = UIImage(systemName: symbolName(type: maneuver.maneuverType, modifier: maneuver.modifier))
        item.initialTravelEstimates = CPTravelEstimates(
            distanceRemaining: Measurement(value: max(maneuver.distanceToManeuverM, 0), unit: .meters),
            timeRemaining: max(remainingMinutes, 0) * 60
        )
        return item
    }

    private func timeRemaining(distanceM: Double, snapshot: RideCarPlaySnapshot) -> TimeInterval {
        let remainingM = max(snapshot.remainingDistanceKm, 0) * 1_000
        let remainingS = max(snapshot.remainingDurationMinutes, 0) * 60
        guard remainingM > 0, remainingS > 0 else {
            return 0
        }
        return remainingS * (max(distanceM, 0) / remainingM)
    }

    private func symbolName(type: String, modifier: String) -> String {
        if type == "roundabout" {
            return "arrow.triangle.2.circlepath"
        }
        if type == "uturn" || modifier == "uturn" {
            return "arrow.uturn.left"
        }
        if type == "arrive" {
            return "flag.fill"
        }
        if type == "merge" || type == "on_ramp" {
            return "arrow.triangle.merge"
        }
        if type == "off_ramp" {
            return "arrow.triangle.branch"
        }
        switch modifier {
        case "left", "sharp_left":
            return "arrow.turn.up.left"
        case "right", "sharp_right":
            return "arrow.turn.up.right"
        case "slight_left":
            return "arrow.up.left"
        case "slight_right":
            return "arrow.up.right"
        default:
            return "arrow.up"
        }
    }
}
