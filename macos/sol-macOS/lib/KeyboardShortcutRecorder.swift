import Carbon
import Cocoa

class KeyboardShortcutRecorder {
  private var monitor: Any?
  var onShortcut: (([String]) -> Void)?
  var onCancel: (() -> Void)?

  func startRecording() {
    guard monitor == nil else { return }
    HotKeyManager.shared.pauseForRecording(true)
    monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      guard let self = self else { return event }
      if event.keyCode == UInt16(kVK_Escape) {
        self.onCancel?()
        return nil
      }
      let keys = self.keysFrom(event: event)
      self.onShortcut?(keys)
      return nil
    }
  }

  func stopRecording() {
    if let monitor = monitor {
      NSEvent.removeMonitor(monitor)
      self.monitor = nil
      HotKeyManager.shared.pauseForRecording(false)
    }
  }

  private func keysFrom(event: NSEvent) -> [String] {
    var keys: [String] = []
    if event.modifierFlags.contains(.command) { keys.append("command") }
    if event.modifierFlags.contains(.control) { keys.append("control") }
    if event.modifierFlags.contains(.option) { keys.append("option") }
    if event.modifierFlags.contains(.shift) { keys.append("shift") }
    switch event.keyCode {
    case UInt16(kVK_RightArrow): keys.append("right")
    case UInt16(kVK_LeftArrow): keys.append("left")
    case UInt16(kVK_UpArrow): keys.append("up")
    case UInt16(kVK_DownArrow): keys.append("down")
    case UInt16(kVK_Return): keys.append("return")
    case UInt16(kVK_Space): keys.append("space")
    default:
      if let chars = event.charactersIgnoringModifiers?.lowercased(), !chars.isEmpty { keys.append(chars) }
    }
    return keys
  }

  deinit { stopRecording() }
}
