import MapKit
import UIKit

final class RideCarPlayMapViewController: UIViewController, MKMapViewDelegate {
    private let mapView = MKMapView(frame: .zero)
    private var puck: MKPointAnnotation?
    private var following = true

    override func viewDidLoad() {
        super.viewDidLoad()
        mapView.translatesAutoresizingMaskIntoConstraints = false
        mapView.delegate = self
        mapView.isRotateEnabled = true
        mapView.isPitchEnabled = true
        mapView.showsCompass = false
        mapView.pointOfInterestFilter = .excludingAll
        view.addSubview(mapView)
        NSLayoutConstraint.activate([
            mapView.topAnchor.constraint(equalTo: view.topAnchor),
            mapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            mapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            mapView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    func apply(_ snapshot: RideCarPlaySnapshot) {
        updateRoute(snapshot.coordinates)
        updatePuck(snapshot.userLocation, headingDeg: snapshot.headingDeg)
        if following {
            follow(snapshot)
        }
    }

    func recenter(_ snapshot: RideCarPlaySnapshot?) {
        following = true
        if let snapshot {
            follow(snapshot)
        }
    }

    func clear() {
        mapView.removeOverlays(mapView.overlays)
        if let puck {
            mapView.removeAnnotation(puck)
            self.puck = nil
        }
        following = true
    }

    func stopFollowing() {
        following = false
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let polyline = overlay as? MKPolyline else {
            return MKOverlayRenderer(overlay: overlay)
        }
        let renderer = MKPolylineRenderer(polyline: polyline)
        renderer.strokeColor = .systemBlue
        renderer.lineWidth = 8
        renderer.lineCap = .round
        renderer.lineJoin = .round
        return renderer
    }

    private func updateRoute(_ coordinates: [RideCarPlayCoordinate]) {
        mapView.removeOverlays(mapView.overlays)
        guard coordinates.count >= 2 else {
            return
        }
        var points = coordinates.map {
            CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
        }
        let polyline = MKPolyline(coordinates: &points, count: points.count)
        mapView.addOverlay(polyline, level: .aboveRoads)
    }

    private func updatePuck(_ location: RideCarPlayCoordinate?, headingDeg: Double?) {
        guard let location else {
            if let puck {
                mapView.removeAnnotation(puck)
                self.puck = nil
            }
            return
        }
        let coordinate = CLLocationCoordinate2D(
            latitude: location.latitude,
            longitude: location.longitude
        )
        if let puck {
            puck.coordinate = coordinate
        } else {
            let annotation = MKPointAnnotation()
            annotation.coordinate = coordinate
            annotation.title = "Position"
            mapView.addAnnotation(annotation)
            puck = annotation
        }
        _ = headingDeg
    }

    private func follow(_ snapshot: RideCarPlaySnapshot) {
        guard let user = snapshot.userLocation else {
            if snapshot.coordinates.count >= 2 {
                var points = snapshot.coordinates.map {
                    CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
                }
                let polyline = MKPolyline(coordinates: &points, count: points.count)
                mapView.setVisibleMapRect(
                    polyline.boundingMapRect,
                    edgePadding: UIEdgeInsets(top: 80, left: 40, bottom: 80, right: 40),
                    animated: false
                )
            }
            return
        }
        let camera = MKMapCamera(
            lookingAtCenter: CLLocationCoordinate2D(
                latitude: user.latitude,
                longitude: user.longitude
            ),
            fromDistance: cameraDistance(snapshot),
            pitch: 45,
            heading: snapshot.headingDeg ?? 0
        )
        mapView.setCamera(camera, animated: true)
    }

    private func cameraDistance(_ snapshot: RideCarPlaySnapshot) -> CLLocationDistance {
        let meters = snapshot.maneuver?.distanceToManeuverM ?? 400
        return min(max(meters * 3, 250), 1_800)
    }
}
