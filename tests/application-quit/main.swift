import AppKit

final class FakeApplication: QuitApplication {
  var bundleURL: URL?
  var processIdentifier: pid_t
  var activationPolicy: NSApplication.ActivationPolicy
  var isTerminated = false
  var acceptsQuit = true
  var quitRequests = 0

  init(_ path: String, pid: pid_t, policy: NSApplication.ActivationPolicy = .regular) {
    bundleURL = URL(fileURLWithPath: path)
    processIdentifier = pid
    activationPolicy = policy
  }

  func terminate() -> Bool {
    quitRequests += 1
    return acceptsQuit
  }
}

let ownURL = URL(fileURLWithPath: "/Applications/Sol.app")
let target = FakeApplication("/Users/test/Downloads/Example.app", pid: 100)
let unrelated = FakeApplication("/Applications/Other.app", pid: 101)
func quit(_ path: String, apps: [QuitApplication]) -> ApplicationQuitResult {
  RunningApplicationActions.quit(path: path, applications: apps, ownPID: 42, ownBundleURL: ownURL)
}

assert(quit("/Users/test/Downloads/Example.app", apps: [target, unrelated]) == .requested)
assert(target.quitRequests == 1 && unrelated.quitRequests == 0)
assert(quit("/Applications/Missing.app", apps: [target]) == .notRunning)
assert(quit("relative/Example.app", apps: [target]) == .notRunning)
assert(quit("/Users/test/Downloads/Example", apps: [target]) == .notRunning)
assert(quit("/Applications/../Applications/Sol.app", apps: [target]) == .protectedApplication)
let ownProcess = FakeApplication("/Downloads/DevelopmentSol.app", pid: 42)
assert(quit("/Downloads/DevelopmentSol.app", apps: [ownProcess]) == .protectedApplication)
assert(ownProcess.quitRequests == 0)
let background = FakeApplication("/Applications/Helper.app", pid: 102, policy: .accessory)
assert(quit("/Applications/Helper.app", apps: [background]) == .notRunning)
assert(background.quitRequests == 0)
target.isTerminated = true
assert(quit("/Users/test/Downloads/Example.app", apps: [target]) == .notRunning)
assert(target.quitRequests == 1)
target.isTerminated = false
target.acceptsQuit = false
assert(quit("/Users/test/Downloads/Example.app", apps: [target]) == .failed)
assert(target.quitRequests == 2)
print("Application quit policy passed: exact bundle matching, normal quit, exited/declined apps, self/helper protection")
