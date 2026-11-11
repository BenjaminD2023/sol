import Foundation

func command(_ raw: String) -> String? { URL(string: raw).flatMap(SolCommandURL.text(from:)) }
precondition(command("sol-benjamin://command?text=%2Ftodo%20C%2B%2B%20A%26B%3D1%2B2") == "/todo C++ A&B=1+2")
precondition(command("sol-benjamin://command?text=%2Fcountdown%20%E5%AD%A6%E7%94%9F") == "/countdown 学生")
precondition(command("SOL-BENJAMIN://COMMAND?text=a+b") == "a+b")
for invalid in ["studenthub://command?text=x", "sol-benjamin://other?text=x", "sol-benjamin://command?text=", "sol-benjamin://command?text=x&text=y", "sol-benjamin://command?text=%00", "sol-benjamin://user@command?text=x", "sol-benjamin://command/path?text=x"] {
  precondition(command(invalid) == nil, "Must reject malformed command route")
}
precondition(command("sol-benjamin://command?text=" + String(repeating: "x", count: 10000)) != nil)
precondition(command("sol-benjamin://command?text=" + String(repeating: "x", count: 10001)) == nil)

let emitter = SolEmitter()
let native = SolNative()
emitter.registerEmitter(emitter: native)
emitter.onShow(target: "SEARCH", query: "/todo first")
emitter.onShow(target: nil)
emitter.onShow(target: "SEARCH", query: "/todo latest")
precondition(native.events.isEmpty, "First-launch command must wait for JS listeners")
emitter.hasListeners = true
RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.02))
precondition(native.events.count == 1)
let payload = native.events[0].1 as! [String: Any]
precondition(native.events[0].0 == "onShow")
precondition(payload["target"] as? String == "SEARCH")
precondition(payload["query"] as? String == "/todo latest")
emitter.hasListeners = false
emitter.hasListeners = true
RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.02))
precondition(native.events.count == 1, "An already delivered draft must not replay")
emitter.onShow(target: "SEARCH", query: "/capture warm launch")
precondition(native.events.count == 2)
print("URL validation, encoding, cold-start queue, one-time delivery and warm-launch checks passed.")
