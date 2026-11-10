import Carbon
import Cocoa

class KeyboardShortcutRecorder {
  private var monitor: Any?
  private var pendingShortcut: (keyCode: UInt16, keys: [String])?
  var onShortcut: (([String]) -> Void)?
  var onCancel: (() -> Void)?

  func startRecording() {
    guard monitor == nil else { return }
    HotKeyManager.shared.pauseForRecording(true)
    monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp]) { [weak self] event in
      guard let self = self else { return event }
      return self.handle(event: event)
    }
  }

  func stopRecording() {
    pendingShortcut = nil
    if let monitor = monitor {
      NSEvent.removeMonitor(monitor)
      self.monitor = nil
      HotKeyManager.shared.pauseForRecording(false)
    }
  }

  // Commit on release while hotkeys are still paused. Registering a new
  // launcher on keyDown would let that same keyUp immediately toggle Sol.
  func handle(event: NSEvent) -> NSEvent? {
    if event.type == .keyDown {
      if event.keyCode == UInt16(kVK_Escape) {
        pendingShortcut = nil
        onCancel?()
      } else if !event.isARepeat {
        pendingShortcut = (event.keyCode, keysFrom(event: event))
      }
      return nil
    }
    if event.type == .keyUp {
      if let shortcut = pendingShortcut, shortcut.keyCode == event.keyCode {
        pendingShortcut = nil
        onShortcut?(shortcut.keys)
      }
      return nil
    }
    return event
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
