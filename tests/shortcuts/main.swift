import Carbon
import Cocoa
import HotKey

_ = NSApplication.shared
let manager = HotKeyManager.shared
manager.setLauncherShortcut("control+option+j")
precondition(manager.mainHotKey.keyCombo == KeyCombo(key: .j, modifiers: [.control, .option]))
let valid = manager.mainHotKey.keyCombo
manager.setLauncherShortcut("invalid+shortcut")
precondition(manager.mainHotKey.keyCombo == valid)

manager.pauseForRecording(true)
manager.setLauncherShortcut("option+space")
precondition(manager.mainHotKey.isPaused)
manager.updateHotkeys(hotkeyMap: ["action": "control+option+u"])
manager.pauseForRecording(false)
precondition(!manager.mainHotKey.isPaused)

func event(_ type: NSEvent.EventType, keyCode: UInt16, characters: String, repeatKey: Bool = false) -> NSEvent {
  NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [.control, .option],
    timestamp: 0, windowNumber: 0, context: nil, characters: characters,
    charactersIgnoringModifiers: characters, isARepeat: repeatKey, keyCode: keyCode)!
}

let recorder = KeyboardShortcutRecorder()
var recorded: [[String]] = []
var cancelled = false
recorder.onShortcut = { recorded.append($0) }
recorder.onCancel = { cancelled = true }
recorder.startRecording()
precondition(manager.mainHotKey.isPaused)
precondition(recorder.handle(event: event(.keyDown, keyCode: UInt16(kVK_ANSI_J), characters: "j")) == nil)
precondition(recorded.isEmpty, "Registration must wait until the key is released")
_ = recorder.handle(event: event(.keyDown, keyCode: UInt16(kVK_ANSI_J), characters: "j", repeatKey: true))
_ = recorder.handle(event: event(.keyUp, keyCode: UInt16(kVK_ANSI_J), characters: "j"))
precondition(recorded == [["control", "option", "j"]])
_ = recorder.handle(event: event(.keyDown, keyCode: UInt16(kVK_Escape), characters: "\u{1b}"))
precondition(cancelled)
recorder.stopRecording()
precondition(!manager.mainHotKey.isPaused)
print("Native shortcut parsing, recording/release, cancellation and pause checks passed.")
