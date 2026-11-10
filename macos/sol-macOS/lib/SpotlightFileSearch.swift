import Foundation

// Shared filename semantics for Spotlight results and the local fallback index.
enum FileSearchSupport {
  static func normalized(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive],
      locale: Locale(identifier: "en_US_POSIX"))
  }

  static func tokens(_ query: String) -> [String] {
    normalized(query).split(whereSeparator: { $0.isWhitespace }).map(String.init)
  }

  static func escapedLike(_ value: String) -> String {
    value.replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "%", with: "\\%")
      .replacingOccurrences(of: "_", with: "\\_")
  }

  static func isWithin(_ path: String, root: String) -> Bool {
    path == root || path.hasPrefix(root.hasSuffix("/") ? root : root + "/")
  }

  static func isSearchablePath(_ path: String) -> Bool {
    !path.split(separator: "/").contains(where: { $0.hasPrefix(".") })
      && !path.contains(".app/") && !path.contains(".framework/")
  }

  static func ranked(_ files: [File], query: String, roots: [String], limit: Int = 100) -> [File] {
    let terms = tokens(query)
    let phrase = normalized(query.trimmingCharacters(in: .whitespacesAndNewlines))
    guard !terms.isEmpty else { return [] }
    var seen = Set<String>()
    let candidates = files.filter { file in
      guard roots.contains(where: { isWithin(file.path, root: $0) }),
        isSearchablePath(file.path),
        terms.allSatisfy({ normalized(file.name).contains($0) }),
        seen.insert(file.path).inserted
      else { return false }
      return FileManager.default.fileExists(atPath: file.path)
    }
    func tier(_ file: File) -> Int {
      let name = normalized(file.name)
      if name == phrase || normalized((file.name as NSString).deletingPathExtension) == phrase {
        return 0
      }
      return name.hasPrefix(phrase) ? 1 : 2
    }
    return Array(candidates.sorted {
      let left = tier($0), right = tier($1)
      if left != right { return left < right }
      if $0.name.count != $1.name.count { return $0.name.count < $1.name.count }
      let order = $0.name.localizedStandardCompare($1.name)
      if order != .orderedSame { return order == .orderedAscending }
      return $0.path < $1.path
    }.prefix(limit))
  }
}

// NSMetadataQuery must be started and stopped on a thread with a run loop.
// Main-queue ownership also makes cancellation and promise completion atomic.
final class SpotlightFileSearch {
  static let shared = SpotlightFileSearch()
  private let index: FileSearchIndex
  private var activeQuery: NSMetadataQuery?
  private var observer: NSObjectProtocol?
  private var timeout: DispatchWorkItem?
  private var completion: (([File]) -> Void)?
  private var generation = 0

  init(index: FileSearchIndex = .shared) {
    self.index = index
  }

  func cancel() {
    dispatchPrecondition(condition: .onQueue(.main))
    generation += 1
    stopQuery()
    let callback = completion
    completion = nil
    callback?([])
  }

  private func stopQuery() {
    timeout?.cancel()
    timeout = nil
    if let observer = observer { NotificationCenter.default.removeObserver(observer) }
    observer = nil
    activeQuery?.stop()
    activeQuery = nil
  }

  func search(query text: String, paths: [String], completion: @escaping ([File]) -> Void) {
    cancel()
    let terms = FileSearchSupport.tokens(text)
    guard !terms.isEmpty else { completion([]); return }
    self.completion = completion
    let currentGeneration = generation
    // Spotlight already owns the home-folder index; never recursively build a
    // second index of the entire home directory just to search it.
    let roots = Array(Set(([NSHomeDirectory()] + paths).filter { $0.hasPrefix("/") }
      .map { URL(fileURLWithPath: $0).standardizedFileURL.path }))
    let query = NSMetadataQuery()
    query.searchScopes = roots
    let predicates = terms.map {
      NSPredicate(format: "%K CONTAINS[cd] %@", NSMetadataItemFSNameKey, $0)
    }
    query.predicate = predicates.count == 1 ? predicates[0]
      : NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
    query.notificationBatchingInterval = 0.05
    activeQuery = query
    observer = NotificationCenter.default.addObserver(
      forName: .NSMetadataQueryDidFinishGathering, object: query, queue: .main
    ) { [weak self] _ in
      self?.finish(text: text, roots: roots, generation: currentGeneration)
    }
    let deadline = DispatchWorkItem { [weak self] in
      self?.finish(text: text, roots: roots, generation: currentGeneration)
    }
    timeout = deadline
    DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: deadline)
    if !query.start() { finish(text: text, roots: roots, generation: currentGeneration) }
  }

  private func finish(text: String, roots: [String], generation expected: Int) {
    guard expected == generation, let query = activeQuery else { return }
    query.disableUpdates()
    let metadataItems = query.results.compactMap { $0 as? NSMetadataItem }
    stopQuery()
    DispatchQueue.global(qos: .userInitiated).async { [self] in
      let spotlight = metadataItems.compactMap { item -> File? in
        guard let path = item.value(forAttribute: NSMetadataItemPathKey) as? String,
          let name = item.value(forAttribute: NSMetadataItemFSNameKey) as? String else { return nil }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) else { return nil }
        return File(path: path, name: name, is_folder: isDirectory.boolValue)
      }
      let fallback = index.searchFiles(query: text, roots: roots)
      let results = FileSearchSupport.ranked(spotlight + fallback, query: text, roots: roots)
      DispatchQueue.main.async { [weak self] in
        guard let self = self, self.generation == expected else { return }
        let callback = self.completion
        self.completion = nil
        callback?(results)
      }
    }
  }
}
