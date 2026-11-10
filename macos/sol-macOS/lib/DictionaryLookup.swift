import CoreServices
import Foundation

enum DictionaryLookup {
  // Dictionary Services uses installed, active dictionaries in the user's order.
  // No web lookup or Dictionary.app/Wikipedia fallback is performed.
  static func definition(for input: String) -> String? {
    let word = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !word.isEmpty, word.utf16.count <= 256,
      word.rangeOfCharacter(from: .controlCharacters) == nil
    else { return nil }

    let text = word as CFString
    let range = CFRange(location: 0, length: CFStringGetLength(text))
    guard let definition = DCSCopyTextDefinition(nil, text, range)?.takeRetainedValue() else {
      return nil
    }
    let value = (definition as String).trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}
