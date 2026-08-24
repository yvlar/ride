import Capacitor
import UIKit

final class RideBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(RideCarPlayPlugin())
    }
}
