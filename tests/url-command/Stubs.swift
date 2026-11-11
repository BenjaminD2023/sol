import Foundation

final class SolNative {
  var events: [(String, Any?)] = []
  func sendEvent(withName name: String, body: Any?) { events.append((name, body)) }
}
