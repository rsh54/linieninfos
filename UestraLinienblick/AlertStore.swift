import Foundation

@MainActor
final class AlertStore: ObservableObject {
    @Published var alerts: [TransitAlert] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var lastRefresh: Date?

    func refresh(endpoint: String, selectedLines: Set<String>) async {
        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
            lastRefresh = Date()
        }

        do {
            if let url = makeURL(endpoint: endpoint, selectedLines: selectedLines) {
                alerts = filter(try await fetchJSONAlerts(from: url), selectedLines: selectedLines)
            } else {
                alerts = filter(try await UestraWebClient().fetchAlerts(), selectedLines: selectedLines)
            }
        } catch {
            alerts = filter(TransitAlert.samples, selectedLines: selectedLines)
            errorMessage = "Konnte die Meldungen nicht laden. Zeige Beispieldaten."
        }
    }

    private func filter(_ alerts: [TransitAlert], selectedLines: Set<String>) -> [TransitAlert] {
        let normalized = Set(selectedLines.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() })
        return alerts
            .filter { normalized.isEmpty || normalized.contains($0.line.lowercased()) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    private func makeURL(endpoint: String, selectedLines: Set<String>) -> URL? {
        let trimmed = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, var components = URLComponents(string: trimmed) else {
            return nil
        }

        if selectedLines.isEmpty == false,
           components.queryItems?.contains(where: { $0.name == "lines" }) != true {
            var queryItems = components.queryItems ?? []
            queryItems.append(URLQueryItem(name: "lines", value: selectedLines.sorted().joined(separator: ",")))
            components.queryItems = queryItems
        }

        return components.url
    }

    private func decodeAlerts(from data: Data) throws -> [TransitAlert] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        if let response = try? decoder.decode(AlertResponse.self, from: data) {
            return response.alerts
        }

        return try decoder.decode([TransitAlert].self, from: data)
    }

    private func fetchJSONAlerts(from url: URL) async throws -> [TransitAlert] {
        let (data, response) = try await URLSession.shared.data(from: url)
        if let httpResponse = response as? HTTPURLResponse,
           !(200...299).contains(httpResponse.statusCode) {
            throw URLError(.badServerResponse)
        }

        return try decodeAlerts(from: data)
    }
}
