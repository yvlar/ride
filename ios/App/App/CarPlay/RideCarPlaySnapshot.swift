import Foundation
import Capacitor

struct RideCarPlayCoordinate {
    let latitude: Double
    let longitude: Double
}

struct RideCarPlayManeuver {
    let instruction: String
    let roadLabel: String?
    let distanceToManeuverM: Double
    let maneuverType: String
    let modifier: String
}

struct RideCarPlaySnapshot {
    let coordinates: [RideCarPlayCoordinate]
    let userLocation: RideCarPlayCoordinate?
    let headingDeg: Double?
    let remainingDistanceKm: Double
    let remainingDurationMinutes: Double
    let muted: Bool
    let lowAccuracy: Bool
    let maneuver: RideCarPlayManeuver?
    let speakText: String?

    static func from(call: CAPPluginCall) -> RideCarPlaySnapshot {
        let coordinates = (call.getArray("coordinates") ?? []).compactMap(coordinate(from:))
        return RideCarPlaySnapshot(
            coordinates: coordinates,
            userLocation: coordinate(from: call.getObject("userLocation")),
            headingDeg: call.getDouble("headingDeg"),
            remainingDistanceKm: call.getDouble("remainingDistanceKm") ?? 0,
            remainingDurationMinutes: call.getDouble("remainingDurationMinutes") ?? 0,
            muted: call.getBool("muted") ?? false,
            lowAccuracy: call.getBool("lowAccuracy") ?? false,
            maneuver: maneuver(from: call.getObject("maneuver")),
            speakText: call.getString("speakText")
        )
    }

    private static func coordinate(from value: JSValue?) -> RideCarPlayCoordinate? {
        guard let object = value as? JSObject else {
            return nil
        }
        return coordinate(from: object)
    }

    private static func coordinate(from object: JSObject?) -> RideCarPlayCoordinate? {
        guard let object,
              let latitude = double(object["latitude"]),
              let longitude = double(object["longitude"]) else {
            return nil
        }
        return RideCarPlayCoordinate(latitude: latitude, longitude: longitude)
    }

    private static func maneuver(from object: JSObject?) -> RideCarPlayManeuver? {
        guard let object,
              let instruction = object["instruction"] as? String else {
            return nil
        }
        return RideCarPlayManeuver(
            instruction: instruction,
            roadLabel: object["roadLabel"] as? String,
            distanceToManeuverM: double(object["distanceToManeuverM"]) ?? 0,
            maneuverType: object["maneuverType"] as? String ?? "unknown",
            modifier: object["modifier"] as? String ?? "unknown"
        )
    }

    private static func double(_ value: Any?) -> Double? {
        if value is NSNull {
            return nil
        }
        if let number = value as? NSNumber {
            let parsed = number.doubleValue
            return parsed.isFinite ? parsed : nil
        }
        if let parsed = value as? Double, parsed.isFinite {
            return parsed
        }
        if let parsed = value as? Int {
            return Double(parsed)
        }
        return nil
    }
}
