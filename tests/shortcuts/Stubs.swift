import Cocoa

final class PanelManager {
  static let shared = PanelManager()
  func toggle() {}
}

final class SolEmitter {
  static let sharedInstance = SolEmitter()
  func onShow(target: String) {}
  func onHotkey(id: String) {}
  func keyDown(key: String?, keyCode: UInt16, meta: Bool, shift: Bool, control: Bool) {}
  func keyUp(key: String?, keyCode: UInt16, meta: Bool, shift: Bool, control: Bool) {}
}
