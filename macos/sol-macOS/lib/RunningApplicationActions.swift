import AppKit

// Keep termination policy independent of the bridge so it can be checked without
// sending quit requests to any of the user's applications.
protocol QuitApplication {
  var bundleURL: URL? { get }
  var processIdentifier: pid_t { get }
  var activationPolicy: NSApplication.ActivationPolicy { get }
  var isTerminated: Bool { get }
  func terminate() -> Bool
}

extension NSRunningApplication: QuitApplication {}

enum ApplicationQuitResult: String {
  case requested
  case notRunning
  case protectedApplication
  case failed
}

enum RunningApplicationActions {
  static func quit(
    path: String,
    applications: [QuitApplication] = NSWorkspace.shared.runningApplications,
    ownPID: pid_t = ProcessInfo.processInfo.processIdentifier,
    ownBundleURL: URL = Bundle.main.bundleURL
  ) -> ApplicationQuitResult {
    guard path.hasPrefix("/"), (path as NSString).pathExtension.lowercased() == "app" else {
      return .notRunning
    }

    let target = URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath()
    guard target != ownBundleURL.standardizedFileURL.resolvingSymlinksInPath() else {
      return .protectedApplication
    }

    let matches = applications.filter {
      !$0.isTerminated && $0.bundleURL?.standardizedFileURL.resolvingSymlinksInPath() == target
    }
    guard !matches.contains(where: { $0.processIdentifier == ownPID }) else {
      return .protectedApplication
    }

    let regularApps = matches.filter { $0.activationPolicy == .regular }
    guard !regularApps.isEmpty else { return .notRunning }

    // terminate() sends the normal macOS quit request. Applications retain their
    // usual opportunity to ask about unsaved work or cancel termination.
    var requested = false
    for application in regularApps {
      if application.terminate() { requested = true }
    }
    return requested ? .requested : .failed
  }
}
