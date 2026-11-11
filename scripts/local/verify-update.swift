#!/usr/bin/swift
import CryptoKit
import Foundation

private let sparkleNamespace = "http://www.andymatuschak.org/xml-namespaces/sparkle"

private struct UpdateItem {
  var versions: [String] = []
  var shortVersions: [String] = []
  var enclosures: [[String: String]] = []
}

private final class FeedParser: NSObject, XMLParserDelegate {
  var items: [UpdateItem] = []
  private var current: UpdateItem?
  private var collecting: String?
  private var text = ""

  func parser(_ parser: XMLParser, didStartElement elementName: String,
              namespaceURI: String?, qualifiedName qName: String?, attributes: [String: String]) {
    if elementName == "item", namespaceURI == nil || namespaceURI == "" {
      current = UpdateItem()
    } else if current != nil, elementName == "enclosure", namespaceURI == nil || namespaceURI == "" {
      current?.enclosures.append(attributes)
      if let version = attributes["sparkle:version"] { current?.versions.append(version) }
      if let version = attributes["sparkle:shortVersionString"] { current?.shortVersions.append(version) }
    } else if current != nil, namespaceURI == sparkleNamespace,
              elementName == "version" || elementName == "shortVersionString" {
      collecting = elementName
      text = ""
    }
  }

  func parser(_ parser: XMLParser, foundCharacters string: String) {
    if collecting != nil { text += string }
  }

  func parser(_ parser: XMLParser, didEndElement elementName: String,
              namespaceURI: String?, qualifiedName qName: String?) {
    if elementName == collecting, namespaceURI == sparkleNamespace {
      let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
      if elementName == "version" { current?.versions.append(value) }
      else { current?.shortVersions.append(value) }
      collecting = nil
      text = ""
    } else if elementName == "item", namespaceURI == nil || namespaceURI == "" {
      if let item = current { items.append(item) }
      current = nil
    }
  }
}

private func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data(("Update verification failed: " + message + "\n").utf8))
  exit(1)
}

let arguments = CommandLine.arguments
if arguments.count != 6 {
  fail("usage: verify-update.swift ARCHIVE FEED INFO_PLIST BUILD EXPECTED_DOWNLOAD_URL")
}
let archiveURL = URL(fileURLWithPath: arguments[1])
let feedURL = URL(fileURLWithPath: arguments[2])
let infoURL = URL(fileURLWithPath: arguments[3])
let expectedBuild = arguments[4]
let expectedURL = arguments[5]

do {
  let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: infoURL), format: nil) as? [String: Any]
  guard info?["CFBundleIdentifier"] as? String == "com.benjamind2023.sol",
        info?["CFBundleVersion"] as? String == expectedBuild,
        let publicKeyText = info?["SUPublicEDKey"] as? String,
        let publicKeyData = Data(base64Encoded: publicKeyText), publicKeyData.count == 32 else {
    fail("bundle identity, build, or public key is invalid")
  }
  let parser = XMLParser(data: try Data(contentsOf: feedURL))
  let delegate = FeedParser()
  parser.shouldProcessNamespaces = true
  parser.shouldResolveExternalEntities = false
  parser.delegate = delegate
  guard parser.parse(), delegate.items.count == 1, let item = delegate.items.first,
        !item.versions.isEmpty, item.versions.allSatisfy({ $0 == expectedBuild }),
        item.enclosures.count == 1, let enclosure = item.enclosures.first,
        enclosure["url"] == expectedURL, URL(string: expectedURL)?.scheme == "https",
        let lengthText = enclosure["length"], let length = UInt64(lengthText),
        let signatureText = enclosure["sparkle:edSignature"],
        let signature = Data(base64Encoded: signatureText), signature.count == 64 else {
    fail("feed version, enclosure URL, length, or Ed25519 signature metadata is invalid")
  }
  if let shortVersion = info?["CFBundleShortVersionString"] as? String,
     !item.shortVersions.allSatisfy({ $0 == shortVersion }) {
    fail("feed marketing version differs from the application")
  }
  let archive = try Data(contentsOf: archiveURL, options: .mappedIfSafe)
  guard UInt64(archive.count) == length else { fail("archive byte count differs from the feed") }
  let publicKey = try Curve25519.Signing.PublicKey(rawRepresentation: publicKeyData)
  guard publicKey.isValidSignature(signature, for: archive) else {
    fail("archive signature does not match the application's public key")
  }
  print("Verified build \(expectedBuild): archive signature, byte count and appcast metadata.")
} catch {
  fail(error.localizedDescription)
}
