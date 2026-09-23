import Foundation

struct UestraWebClient {
    private let baseURL = URL(string: "https://www.uestra.de/aktuelles/neuigkeiten/aktuelle-meldungen/")!

    func fetchAlerts() async throws -> [TransitAlert] {
        var allItems: [ParsedNewsItem] = []

        for page in 1...3 {
            let url = page == 1 ? baseURL : baseURL.appending(path: "seite-\(page)/")
            let (data, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse,
               !(200...299).contains(httpResponse.statusCode) {
                throw URLError(.badServerResponse)
            }

            guard let html = String(data: data, encoding: .utf8) else {
                continue
            }

            allItems.append(contentsOf: parseNews(html: html, pageURL: url))
        }

        let now = Date()
        var results: [String: TransitAlert] = [:]

        for item in allItems {
            let lines = linesFromText(item.title, item.detail)
            for line in lines {
                let id = "uestra-\(stableID(item.title + item.detail))-\(line)"
                results[id] = TransitAlert(
                    id: id,
                    line: line,
                    title: item.title,
                    detail: item.detail,
                    severity: severity(title: item.title, detail: item.detail),
                    updatedAt: now,
                    url: item.url
                )
            }
        }

        return Array(results.values)
    }

    private func parseNews(html: String, pageURL: URL) -> [ParsedNewsItem] {
        let blocks = html
            .replacingOccurrences(of: "\n", with: " ")
            .components(separatedBy: "Verkehrsmeldungen")

        guard blocks.count > 1 else {
            return []
        }

        return blocks.dropFirst().compactMap { block in
            guard let title = firstMatch(in: block, pattern: #"<h3[^>]*>(.*?)</h3>"#) else {
                return nil
            }

            let detail = firstMatch(in: block, pattern: #"<p[^>]*>(.*?)</p>"#) ?? title
            let href = firstMatch(in: block, pattern: #"<a[^>]+href="([^"]+)""#)
            let url = href.flatMap { URL(string: $0, relativeTo: pageURL)?.absoluteURL } ?? pageURL

            return ParsedNewsItem(
                title: cleanHTML(title),
                detail: cleanHTML(detail),
                url: url
            )
        }
    }

    private func linesFromText(_ texts: String...) -> Set<String> {
        let text = texts.joined(separator: " ")
        var lines = Set<String>()
        let patterns = [
            #"\bLinie(?:n)?\s+([A-Za-z]?\d{1,3}[A-Za-z]?)\b"#,
            #"\bLinie(?:n)?\s+((?:[A-Za-z]?\d{1,3}[A-Za-z]?\s*(?:,|und|/)?\s*){2,})"#,
            #"\bauf folgenden Linien:\s*([^.;]+)"#
        ]

        for pattern in patterns {
            for match in matches(in: text, pattern: pattern) {
                for part in match.components(separatedBy: CharacterSet(charactersIn: ",/ ")) {
                    let line = part
                        .replacingOccurrences(of: "und", with: "", options: .caseInsensitive)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .uppercased()

                    if line.range(of: #"^[A-Z]?\d{1,3}[A-Z]?$"#, options: .regularExpression) != nil {
                        lines.insert(line)
                    }
                }
            }
        }

        return lines
    }

    private func severity(title: String, detail: String) -> AlertSeverity {
        let text = "\(title) \(detail)".lowercased()
        if ["ausfall", "entfällt", "entfallen", "streik"].contains(where: text.contains) {
            return .cancellation
        }
        if ["ersatzverkehr", "umleitung", "gesperrt", "sperrung", "störung"].contains(where: text.contains) {
            return .disruption
        }
        if ["verspät", "verzöger"].contains(where: text.contains) {
            return .delay
        }
        return .info
    }

    private func firstMatch(in text: String, pattern: String) -> String? {
        matches(in: text, pattern: pattern).first
    }

    private func matches(in text: String, pattern: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators]) else {
            return []
        }

        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return regex.matches(in: text, range: range).compactMap { result in
            guard result.numberOfRanges > 1,
                  let matchRange = Range(result.range(at: 1), in: text) else {
                return nil
            }
            return String(text[matchRange])
        }
    }

    private func cleanHTML(_ value: String) -> String {
        value
            .replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&uuml;", with: "ü")
            .replacingOccurrences(of: "&Uuml;", with: "Ü")
            .replacingOccurrences(of: "&auml;", with: "ä")
            .replacingOccurrences(of: "&Auml;", with: "Ä")
            .replacingOccurrences(of: "&ouml;", with: "ö")
            .replacingOccurrences(of: "&Ouml;", with: "Ö")
            .replacingOccurrences(of: "&szlig;", with: "ß")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#039;", with: "'")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func stableID(_ value: String) -> String {
        String(value.unicodeScalars.reduce(UInt32(5381)) { (($0 << 5) &+ $0) &+ $1.value }, radix: 16)
    }
}

private struct ParsedNewsItem {
    let title: String
    let detail: String
    let url: URL
}
