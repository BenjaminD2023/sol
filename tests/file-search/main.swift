import Foundation
import SQLite3

let fm = FileManager.default
let root = fm.temporaryDirectory.appendingPathComponent("sol-file-search-tests-" + UUID().uuidString)
try fm.createDirectory(at: root, withIntermediateDirectories: true)
defer { try? fm.removeItem(at: root) }
let index = FileSearchIndex(databasePath: root.appendingPathComponent("search.db").path)
func insert(_ name: String, parent: String? = nil, real: Bool = false) {
  let directory = parent ?? root.path
  let path = (directory as NSString).appendingPathComponent(name)
  if real {
    try! fm.createDirectory(atPath: directory, withIntermediateDirectories: true)
    fm.createFile(atPath: path, contents: Data())
  }
  index.upsertFile(path: path, name: name, isFolder: false, parentPath: directory)
}
for number in 0..<1500 { insert(String(format: "ordinary-%04d.txt", number)) }
insert("Late Unique Homework.pdf", real: true)
for number in 0..<250 { insert(String(format: "stale-%04d.txt", number)) }
insert("stale-zzzz-real.txt", real: true)
insert("Résumé Final.PDF", real: true)
insert("数学作业.docx", real: true)
insert("100%_report?.txt", real: true)
insert("O'Reilly Notes.txt", real: true)
insert("report.pdf", real: true)
insert("report draft.pdf", real: true)
assert(index.hasIndexedContent()) // Serial-queue barrier waits for the writes.
let started = Date()
assert(index.searchFiles(query: "late unique").map(\.name) == ["Late Unique Homework.pdf"])
assert(index.searchFiles(query: "resume final").map(\.name) == ["Résumé Final.PDF"])
assert(index.searchFiles(query: "数学").map(\.name) == ["数学作业.docx"])
assert(index.searchFiles(query: "100%_").map(\.name) == ["100%_report?.txt"])
assert(index.searchFiles(query: "O'Reilly").map(\.name) == ["O'Reilly Notes.txt"])
assert(index.searchFiles(query: "   ").isEmpty)
assert(index.searchFiles(query: "stale").map(\.name) == ["stale-zzzz-real.txt"])
print("Indexed filename queries beyond row 1,000 passed in \(Int(Date().timeIntervalSince(started) * 1000))ms")

let childRoot = root.appendingPathComponent("project").path
let siblingRoot = root.appendingPathComponent("project-archive").path
insert("subtree-child.txt", parent: childRoot, real: true)
insert("subtree-sibling.txt", parent: siblingRoot, real: true)
assert(index.hasIndexedContent())
index.removeIndexedPath(childRoot)
assert(index.hasIndexedContent())
assert(index.searchFiles(query: "subtree").map(\.name) == ["subtree-sibling.txt"])
let wildcardRoot = root.appendingPathComponent("wild_card%").path
insert("wildcard-child.txt", parent: wildcardRoot, real: true)
insert("wildcard-sibling.txt", parent: root.appendingPathComponent("wildXcard-other").path, real: true)
assert(index.hasIndexedContent())
index.removeFile(atPath: wildcardRoot)
assert(index.hasIndexedContent())
assert(index.searchFiles(query: "wildcard").map(\.name) == ["wildcard-sibling.txt"])

let report = root.appendingPathComponent("report.pdf")
let draft = root.appendingPathComponent("report draft.pdf")
let ranked = FileSearchSupport.ranked([
  File(path: draft.path, name: draft.lastPathComponent, is_folder: false),
  File(path: report.path, name: report.lastPathComponent, is_folder: false),
  File(path: report.path, name: report.lastPathComponent, is_folder: false),
  File(path: root.appendingPathComponent("missing-report.pdf").path, name: "missing-report.pdf", is_folder: false),
  File(path: "/outside/report.pdf", name: "report.pdf", is_folder: false)
], query: "report", roots: [root.path])
assert(ranked.map(\.name) == ["report.pdf", "report draft.pdf"])
assert(!FileSearchSupport.isWithin(root.path + "-other/a.txt", root: root.path))
assert(FileSearchSupport.isWithin(root.path + "/a.txt", root: root.path))

// Existing databases migrate without reindexing or losing Unicode names.
let oldDatabase = root.appendingPathComponent("old.db").path
let legacyFile = root.appendingPathComponent("Résumé.pdf").path
fm.createFile(atPath: legacyFile, contents: Data())
var db: OpaquePointer?
assert(sqlite3_open(oldDatabase, &db) == SQLITE_OK)
assert(sqlite3_exec(db, "CREATE TABLE files (path TEXT PRIMARY KEY, name TEXT NOT NULL, is_folder INTEGER NOT NULL, parent_path TEXT, indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP); INSERT INTO files(path,name,is_folder) VALUES('\(legacyFile)','Résumé.pdf',0);", nil, nil, nil) == SQLITE_OK)
sqlite3_close(db)
let migrated = FileSearchIndex(databasePath: oldDatabase)
assert(migrated.searchFiles(query: "resume").map(\.name) == ["Résumé.pdf"])

// Files in application packages and symbolic-link cycles must not be walked.
let fixture = root.appendingPathComponent("walk")
try fm.createDirectory(at: fixture.appendingPathComponent("Example.app/Contents"), withIntermediateDirectories: true)
fm.createFile(atPath: fixture.appendingPathComponent("Example.app/Contents/package-secret.txt").path, contents: Data())
fm.createFile(atPath: fixture.appendingPathComponent("walk-visible.txt").path, contents: Data())
try fm.createSymbolicLink(at: fixture.appendingPathComponent("loop"), withDestinationURL: fixture)
index.indexPaths([fixture.path])
assert(index.hasIndexedContent())
assert(index.searchFiles(query: "package-secret").isEmpty)
assert(index.searchFiles(query: "walk-visible").count == 1)

// Start real metadata queries, but use a disposable fallback database and never
// change Spotlight settings or index/delete any of the user's files.
let search = SpotlightFileSearch(index: index)
var cancelledCallbacks = 0
var latestCallbacks = 0
var latestFiles: [File] = []
search.search(query: "cancelled-" + UUID().uuidString, paths: [root.path]) { results in
  cancelledCallbacks += 1
  assert(results.isEmpty)
}
search.search(query: "Late Unique Homework", paths: [root.path]) { results in
  latestCallbacks += 1
  latestFiles = results
}
assert(cancelledCallbacks == 1)
let deadline = Date().addingTimeInterval(4)
while latestCallbacks == 0 && Date() < deadline {
  RunLoop.main.run(until: Date().addingTimeInterval(0.02))
}
assert(latestCallbacks == 1)
assert(latestFiles.map(\.name) == ["Late Unique Homework.pdf"])
search.cancel()
assert(cancelledCallbacks == 1 && latestCallbacks == 1)
print("File search passed: Unicode/literal matching, migration, exact ranking, deduplication, stale paths, safe subtree deletion, package/symlink traversal, native cancellation, metadata/fallback completion")

if let smokePath = ProcessInfo.processInfo.environment["SOL_SPOTLIGHT_SMOKE_PATH"] {
  let emptyIndex = FileSearchIndex(databasePath: root.appendingPathComponent("empty.db").path)
  let spotlightOnly = SpotlightFileSearch(index: emptyIndex)
  var found = false
  var completed = false
  spotlightOnly.search(query: (smokePath as NSString).lastPathComponent, paths: [(smokePath as NSString).deletingLastPathComponent]) { files in
    found = files.contains { $0.path == smokePath }
    completed = true
  }
  let deadline = Date().addingTimeInterval(4)
  while !completed && Date() < deadline {
    RunLoop.main.run(until: Date().addingTimeInterval(0.02))
  }
  assert(completed && found, "Expected a known Spotlight-indexed path without any fallback index")
  print("Spotlight-only real-file smoke passed")
}
