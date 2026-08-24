import Capacitor
import Foundation

@objc(RideCarPlayPlugin)
public class RideCarPlayPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "RideCarPlayPlugin"
    public let jsName = "RideCarPlay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCatalog", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        RideCarPlaySession.shared.plugin = self
        emitConnection(connected: RideCarPlaySession.shared.isConnected)
    }

    @objc func start(_ call: CAPPluginCall) {
        let snapshot = RideCarPlaySnapshot.from(call: call)
        DispatchQueue.main.async {
            RideCarPlaySession.shared.start(snapshot)
            call.resolve([
                "connected": RideCarPlaySession.shared.isConnected,
                "ownsVoice": RideCarPlaySession.shared.isConnected,
            ])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        let snapshot = RideCarPlaySnapshot.from(call: call)
        DispatchQueue.main.async {
            RideCarPlaySession.shared.update(snapshot)
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            RideCarPlaySession.shared.stop()
            call.resolve()
        }
    }

    @objc func getConnection(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "connected": RideCarPlaySession.shared.isConnected,
                "stopRequested": RideCarPlaySession.shared.consumePendingStop(),
                "muted": RideCarPlaySession.shared.muted,
            ])
        }
    }

    @objc func setCatalog(_ call: CAPPluginCall) {
        let catalog = RideCarPlayCatalog.from(call: call)
        DispatchQueue.main.async {
            RideCarPlaySession.shared.setCatalog(catalog)
            call.resolve()
        }
    }

    func emitCatalogSelect(id: String) {
        notifyListeners("catalogSelect", data: ["id": id])
    }

    func emitSearchQuery(query: String) {
        notifyListeners("searchQuery", data: ["query": query])
    }

    func emitConnection(connected: Bool) {
        notifyListeners("connectionChange", data: ["connected": connected])
    }

    func emitMute(muted: Bool) {
        notifyListeners("muteChange", data: ["muted": muted])
    }

    func emitStop() {
        notifyListeners("stopRequested", data: [:])
    }
}
