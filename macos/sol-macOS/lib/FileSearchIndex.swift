import Foundation
import SQLite3

let SQLITE_TRANSIENT = unsafeBitCast(-1 as Int, to: sqlite3_destructor_type?.self)

struct File {
  let path: String
  let name: String
  let is_folder: Bool
}

class FileSearchIndex {
  static let shared = FileSearchIndex()
  
  private var db: OpaquePointer?
  private let dbPath: String
  private let queue = DispatchQueue(label: "com.ospfranco.sol.filesearch.index")
  
  init(databasePath: String? = nil) {
    let paths = NSSearchPathForDirectoriesInDomains(.applicationSupportDirectory, .userDomainMask, true)
    let appSupportDir = paths[0]
    let solDir = (appSupportDir as NSString).appendingPathComponent("Sol")
    
    // Create directory if it doesn't exist
    try? FileManager.default.createDirectory(atPath: solDir, withIntermediateDirectories: true)
    
    self.dbPath = databasePath ?? (solDir as NSString).appendingPathComponent("filesearch.db")
    
    self.initializeDatabase()
  }
  
  private func initializeDatabase() {
    var db: OpaquePointer?
    if sqlite3_open(dbPath, &db) == SQLITE_OK {
      self.db = db
      
      sqlite3_exec(db, "PRAGMA journal_mode=WAL;", nil, nil, nil)
      let createTableSQL = """
        CREATE TABLE IF NOT EXISTS files (
          path TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          search_name TEXT NOT NULL DEFAULT '',
          is_folder INTEGER NOT NULL,
          parent_path TEXT,
          indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_name ON files(name);
        CREATE INDEX IF NOT EXISTS idx_parent ON files(parent_path);
      """
      
      var errorMessage: UnsafeMutablePointer<CChar>? = nil
      if sqlite3_exec(db, createTableSQL, nil, nil, &errorMessage) != SQLITE_OK {
        if let error = errorMessage {
          sqlite3_free(error)
        }
      }
      var columns: OpaquePointer?
      var hasSearchName = false
      if sqlite3_prepare_v2(db, "PRAGMA table_info(files);", -1, &columns, nil) == SQLITE_OK {
        while sqlite3_step(columns) == SQLITE_ROW {
          if let name = sqlite3_column_text(columns, 1), String(cString: name) == "search_name" {
            hasSearchName = true
          }
        }
        sqlite3_finalize(columns)
      }
      if !hasSearchName {
        sqlite3_exec(db, "ALTER TABLE files ADD COLUMN search_name TEXT NOT NULL DEFAULT '';", nil, nil, nil)
      }
      // Backfill old databases once, using the same Unicode folding as new files.
      var names: OpaquePointer?
      var update: OpaquePointer?
      if sqlite3_prepare_v2(db, "SELECT path, name FROM files WHERE search_name = '';", -1, &names, nil) == SQLITE_OK,
        sqlite3_prepare_v2(db, "UPDATE files SET search_name = ? WHERE path = ?;", -1, &update, nil) == SQLITE_OK {
        sqlite3_exec(db, "BEGIN TRANSACTION;", nil, nil, nil)
        while sqlite3_step(names) == SQLITE_ROW {
          guard let path = sqlite3_column_text(names, 0), let name = sqlite3_column_text(names, 1) else { continue }
          sqlite3_bind_text(update, 1, FileSearchSupport.normalized(String(cString: name)), -1, SQLITE_TRANSIENT)
          sqlite3_bind_text(update, 2, String(cString: path), -1, SQLITE_TRANSIENT)
          sqlite3_step(update)
          sqlite3_reset(update)
        }
        sqlite3_exec(db, "COMMIT;", nil, nil, nil)
      }
      sqlite3_finalize(names)
      sqlite3_finalize(update)
    }
  }
  
  func indexPath(_ basePath: NSString) {
    queue.async { [weak self] in
      guard let self = self, let db = self.db else { return }
      self._indexPathIterative(basePath as String, db: db)
    }
  }

  func indexPaths(_ paths: [String]) {
    queue.async { [weak self] in
      guard let self = self, let db = self.db else { return }
      for path in paths {
        self._indexPathIterative(path, db: db)
      }
    }
  }

  func hasIndexedContent() -> Bool {
    var result = false
    queue.sync { [weak self] in
      guard let self = self, let db = self.db else { return }
      var statement: OpaquePointer?
      if sqlite3_prepare_v2(db, "SELECT 1 FROM files LIMIT 1;", -1, &statement, nil) == SQLITE_OK {
        result = sqlite3_step(statement) == SQLITE_ROW
        sqlite3_finalize(statement)
      }
    }
    return result
  }

  func removeIndexedPath(_ basePath: String) {
    queue.async { [weak self] in
      guard let self = self, let db = self.db else { return }
      let deleteSQL = "DELETE FROM files WHERE path = ? OR path LIKE ? ESCAPE '\\';"
      var statement: OpaquePointer?
      if sqlite3_prepare_v2(db, deleteSQL, -1, &statement, nil) == SQLITE_OK {
        sqlite3_bind_text(statement, 1, basePath, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(statement, 2, FileSearchSupport.escapedLike(basePath + "/") + "%", -1, SQLITE_TRANSIENT)
        sqlite3_step(statement)
        sqlite3_finalize(statement)
      }
    }
  }

  func upsertFile(path: String, name: String, isFolder: Bool, parentPath: String) {
    queue.async { [weak self] in
      guard let self = self, let db = self.db else { return }
      self._insertOrUpdateFile(path: path, name: name, isFolder: isFolder, parentPath: parentPath, db: db)
    }
  }

  func removeFile(atPath path: String) {
    queue.async { [weak self] in
      guard let self = self, let db = self.db else { return }
      var statement: OpaquePointer?
      if sqlite3_prepare_v2(db, "DELETE FROM files WHERE path = ? OR path LIKE ? ESCAPE '\\';", -1, &statement, nil) == SQLITE_OK {
        sqlite3_bind_text(statement, 1, path, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(statement, 2, FileSearchSupport.escapedLike(path + "/") + "%", -1, SQLITE_TRANSIENT)
        sqlite3_step(statement)
        sqlite3_finalize(statement)
      }
    }
  }
  
  private func _indexPathIterative(_ rootPath: String, db: OpaquePointer) {
    let fileManager = FileManager.default
    let batchSize = 200
    var pendingDirs: [String] = [rootPath]
    var batchCount = 0

    sqlite3_exec(db, "BEGIN TRANSACTION;", nil, nil, nil)

    while let currentDir = pendingDirs.popLast() {

      guard let dirContents = try? fileManager.contentsOfDirectory(atPath: currentDir) else {
        continue
      }

      for item in dirContents {
        // Skip hidden files and folders
        if item.hasPrefix(".") {
          continue
        }

        let fullPath = (currentDir as NSString).appendingPathComponent(item)
        var isDir: ObjCBool = false

        guard fileManager.fileExists(atPath: fullPath, isDirectory: &isDir) else {
          continue
        }

        self._insertOrUpdateFile(path: fullPath, name: item, isFolder: isDir.boolValue, parentPath: currentDir, db: db)
        batchCount += 1

        if isDir.boolValue,
          let values = try? URL(fileURLWithPath: fullPath).resourceValues(forKeys: [.isPackageKey, .isSymbolicLinkKey]),
          values.isPackage != true, values.isSymbolicLink != true {
          pendingDirs.append(fullPath)
        }

        if batchCount >= batchSize {
          sqlite3_exec(db, "COMMIT;", nil, nil, nil)
          sqlite3_exec(db, "BEGIN TRANSACTION;", nil, nil, nil)
          batchCount = 0
        }
      }
    }

    sqlite3_exec(db, "COMMIT;", nil, nil, nil)
  }

  private func _insertOrUpdateFile(path: String, name: String, isFolder: Bool, parentPath: String, db: OpaquePointer) {
    let insertSQL = """
      INSERT OR REPLACE INTO files (path, name, is_folder, parent_path, search_name)
      VALUES (?, ?, ?, ?, ?)
    """
    
    var statement: OpaquePointer?
    
    if sqlite3_prepare_v2(db, insertSQL, -1, &statement, nil) == SQLITE_OK {
      sqlite3_bind_text(statement, 1, path, -1, SQLITE_TRANSIENT)
      sqlite3_bind_text(statement, 2, name, -1, SQLITE_TRANSIENT)
      sqlite3_bind_int(statement, 3, isFolder ? 1 : 0)
      sqlite3_bind_text(statement, 4, parentPath, -1, SQLITE_TRANSIENT)
      sqlite3_bind_text(statement, 5, FileSearchSupport.normalized(name), -1, SQLITE_TRANSIENT)
      
      sqlite3_step(statement)
      sqlite3_finalize(statement)
    }
  }
  
  func searchFiles(query: String, roots: [String]? = nil) -> [File] {
    let terms = FileSearchSupport.tokens(query)
    guard !terms.isEmpty else { return [] }
    // A separate WAL reader stays responsive while the background indexer walks
    // a large folder. Filter all matching rows before applying a result limit.
    var reader: OpaquePointer?
    let status = sqlite3_open_v2(dbPath, &reader, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil)
    guard status == SQLITE_OK, let reader = reader else {
      if let reader = reader { sqlite3_close(reader) }
      return []
    }
    defer { sqlite3_close(reader) }
    sqlite3_busy_timeout(reader, 250)
    let conditions = terms.map { _ in "search_name LIKE ? ESCAPE '\\'" }.joined(separator: " AND ")
    let sql = """
      SELECT path, name, is_folder FROM files WHERE \(conditions)
      ORDER BY CASE WHEN search_name = ? THEN 0 WHEN search_name LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END,
        length(name), search_name, path;
      """
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(reader, sql, -1, &statement, nil) == SQLITE_OK else { return [] }
    defer { sqlite3_finalize(statement) }
    for (index, term) in terms.enumerated() {
      sqlite3_bind_text(statement, Int32(index + 1), "%" + FileSearchSupport.escapedLike(term) + "%", -1, SQLITE_TRANSIENT)
    }
    let phrase = FileSearchSupport.normalized(query.trimmingCharacters(in: .whitespacesAndNewlines))
    sqlite3_bind_text(statement, Int32(terms.count + 1), phrase, -1, SQLITE_TRANSIENT)
    sqlite3_bind_text(statement, Int32(terms.count + 2), FileSearchSupport.escapedLike(phrase) + "%", -1, SQLITE_TRANSIENT)
    var results: [File] = []
    while sqlite3_step(statement) == SQLITE_ROW {
      if let path = sqlite3_column_text(statement, 0), let name = sqlite3_column_text(statement, 1) {
        let filePath = String(cString: path)
        guard FileSearchSupport.isSearchablePath(filePath),
          roots?.contains(where: { FileSearchSupport.isWithin(filePath, root: $0) }) ?? true,
          FileManager.default.fileExists(atPath: filePath) else { continue }
        results.append(File(path: filePath, name: String(cString: name),
          is_folder: sqlite3_column_int(statement, 2) != 0))
        if results.count == 200 { break }
      }
    }
    return results
  }

  func clearIndex() {
    queue.async { [weak self] in
      guard let self = self, let db = self.db else { return }
      sqlite3_exec(db, "DELETE FROM files;", nil, nil, nil)
    }
  }
  
  deinit {
    if let db = db {
      sqlite3_close(db)
    }
  }
}
