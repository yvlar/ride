import MapKit
import UIKit

final class RideCarPlayMapViewController: UIViewController, MKMapViewDelegate {
    private let mapView = MKMapView(frame: .zero)
    private var puck: RideCarPlayPuckAnnotation?
    private var following = true

    override func viewDidLoad() {
        super.viewDidLoad()
        mapView.translatesAutoresizingMaskIntoConstraints = false
        mapView.delegate = self
        mapView.isRotateEnabled = true
        mapView.isPitchEnabled = true
        mapView.showsBuildings = true
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
        refreshPuckHeading()
    }

    func recenter(_ snapshot: RideCarPlaySnapshot?) {
        following = true
        if let snapshot {
            follow(snapshot)
        }
        refreshPuckHeading()
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

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let puckAnnotation = annotation as? RideCarPlayPuckAnnotation else {
            return nil
        }
        let view =
            (mapView.dequeueReusableAnnotationView(
                withIdentifier: RideCarPlayPuckView.reuseIdentifier
            ) as? RideCarPlayPuckView)
            ?? RideCarPlayPuckView(
                annotation: puckAnnotation,
                reuseIdentifier: RideCarPlayPuckView.reuseIdentifier
            )
        view.annotation = puckAnnotation
        view.apply(
            headingDeg: puckAnnotation.headingDeg,
            cameraHeading: mapView.camera.heading
        )
        return view
    }

    func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
        refreshPuckHeading()
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
        let heading = finiteHeading(headingDeg)
        if let puck {
            puck.coordinate = coordinate
            puck.headingDeg = heading
        } else {
            let annotation = RideCarPlayPuckAnnotation()
            annotation.coordinate = coordinate
            annotation.headingDeg = heading
            annotation.title = "Position"
            mapView.addAnnotation(annotation)
            puck = annotation
        }
    }

    private func refreshPuckHeading() {
        guard let puck,
              let view = mapView.view(for: puck) as? RideCarPlayPuckView
        else {
            return
        }
        view.apply(headingDeg: puck.headingDeg, cameraHeading: mapView.camera.heading)
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
            // Keep in sync with NAVIGATION_FOLLOW_PITCH (FR-024).
            pitch: 60,
            heading: finiteHeading(snapshot.headingDeg) ?? 0
        )
        mapView.setCamera(camera, animated: true)
    }

    private func cameraDistance(_ snapshot: RideCarPlaySnapshot) -> CLLocationDistance {
        let meters = snapshot.maneuver?.distanceToManeuverM ?? 400
        return min(max(meters * 2.5, 180), 1_200)
    }
}

private final class RideCarPlayPuckAnnotation: MKPointAnnotation {
    var headingDeg: Double?
}

private final class RideCarPlayPuckView: MKAnnotationView {
    static let reuseIdentifier = "ride-carplay-puck"

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        image = Self.puckImage
        canShowCallout = false
        displayPriority = .required
        collisionMode = .circle
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func apply(headingDeg: Double?, cameraHeading: CLLocationDirection) {
        guard let headingDeg else {
            transform = .identity
            return
        }
        let relative = headingDeg - cameraHeading
        transform = CGAffineTransform(rotationAngle: CGFloat(relative * .pi / 180))
    }

    private static let puckImage: UIImage = {
        let size = CGSize(width: 22, height: 28)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            let color = UIColor.systemCyan
            let circle = CGRect(x: (size.width - 16) / 2, y: size.height - 16, width: 16, height: 16)
            color.setFill()
            UIBezierPath(ovalIn: circle).fill()
            UIColor.white.setStroke()
            let ring = UIBezierPath(ovalIn: circle.insetBy(dx: 1, dy: 1))
            ring.lineWidth = 2
            ring.stroke()

            let triangle = UIBezierPath()
            triangle.move(to: CGPoint(x: size.width / 2, y: 0))
            triangle.addLine(to: CGPoint(x: size.width / 2 - 5, y: 8))
            triangle.addLine(to: CGPoint(x: size.width / 2 + 5, y: 8))
            triangle.close()
            color.setFill()
            triangle.fill()
        }
    }()
}

private func finiteHeading(_ headingDeg: Double?) -> Double? {
    guard let headingDeg, headingDeg.isFinite else {
        return nil
    }
    let wrapped = headingDeg.truncatingRemainder(dividingBy: 360)
    return wrapped < 0 ? wrapped + 360 : wrapped
}
