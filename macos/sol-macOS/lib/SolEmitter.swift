import Foundation

enum SolCommandURL {
  static func text(from url: URL) -> String? {
    guard url.scheme?.lowercased() == "sol-benjamin", url.host?.lowercased() == "command",
      url.user == nil, url.password == nil, url.port == nil,
      url.path.isEmpty || url.path == "/",
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return nil }
    let values = components.queryItems?.filter { $0.name == "text" } ?? []
    guard values.count == 1, let text = values.first?.value,
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      text.utf16.count <= 10_000, !text.contains("\0")
    else { return nil }
    return text
  }
}

class SolEmitter {

  var hasListeners = false {
    didSet {
      if hasListeners {
        // Native observation can start before the current JS listener setup
        // finishes. Deliver on the next main turn, after registration returns.
        DispatchQueue.main.async { self.flushPendingCommand() }
      }
    }
  }
  private var pendingCommand: [String: Any]?

  public static var sharedInstance = SolEmitter()

  private static var emitter: SolNative?

  func registerEmitter(emitter: SolNative) {
    SolEmitter.emitter = emitter
  }

  func dispatch(name: String, body: Any?) {
    if hasListeners {
      SolEmitter.emitter?.sendEvent(withName: name, body: body)
    }
  }

  // You can add more typesafety here if you want to
  func keyDown(key: String?, keyCode: UInt16, meta: Bool, shift: Bool, control: Bool) {
    dispatch(
      name: "keyDown",
      body: [
        "key": key!,
        "keyCode": keyCode,
        "meta": meta,
        "shift": shift,
        "control": control,
      ])
  }

  func keyUp(key: String?, keyCode: UInt16, meta: Bool, shift: Bool, control: Bool) {
    dispatch(
      name: "keyUp",
      body: [
        "key": key!,
        "keyCode": keyCode,
        "meta": meta,
        "shift": shift,
        "control": control,
      ])
  }

  func onShow(target: String?, query: String? = nil) {
    var body: [String: Any] = [:]
    if let target = target { body["target"] = target }
    if let query = query {
      body["query"] = query
      // Spotlight has one draft input: the latest incoming command wins until
      // JS starts listening. Normal window-show events never erase the draft.
      pendingCommand = body
      flushPendingCommand()
    } else {
      dispatch(name: "onShow", body: body)
    }
  }

  private func flushPendingCommand() {
    guard hasListeners, SolEmitter.emitter != nil, let body = pendingCommand else { return }
    pendingCommand = nil
    dispatch(name: "onShow", body: body)
  }

  func onHotkey(id: String) {
    dispatch(
      name: "hotkey",
      body: [
        "id": id
      ])
  }

  func onHide() {
    dispatch(name: "onHide", body: [])
  }

  func textCopied(_ txt: String, _ bundle: String?) {
    dispatch(
      name: "onTextCopied",
      body: [
        "text": txt,
        "bundle": bundle,
      ])
  }

  func fileCopied(_ text: String, _ url: String, _ bundle: String?) {
    dispatch(
      name: "onFileCopied",
      body: [
        "text": text,
        "url": url,
        "bundle": bundle,
      ])
  }

  func onStatusBarItemClick() {
    dispatch(name: "onStatusBarItemClick", body: [])
  }
}
