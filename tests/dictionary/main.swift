import Foundation

// Compile alongside macos/sol-macOS/lib/DictionaryLookup.swift. These checks use
// the host's installed dictionaries, with no network or Dictionary.app process.
for term in ["", "   ", String(repeating: "a", count: 257), "a\u{0}b", "solzznonexistentword987654321"] {
  precondition(DictionaryLookup.definition(for: term) == nil, "Expected no definition: \(term)")
}

let definition = DispatchQueue(label: "dictionary.test").sync {
  DictionaryLookup.definition(for: "hello")
}
if let definition {
  precondition(!definition.isEmpty)
  precondition(DictionaryLookup.definition(for: "  hello  ") == definition)
  print("Installed dictionary lookup passed (\(definition.utf16.count) UTF-16 code units).")
} else {
  print("No active dictionary contains 'hello'; empty-result checks passed.")
}

// These exercise UTF-16 ranges and missing/optional language dictionaries.
_ = DictionaryLookup.definition(for: "déjà vu")
_ = DictionaryLookup.definition(for: "学生")
_ = DictionaryLookup.definition(for: "🧑🏽‍🎓")
print("Dictionary validation passed.")
