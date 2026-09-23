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

        guard let url = URL(string: endpoint.trimmingCharacters(in: .whitespacesAndNewlines)),
              !endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            alerts = filter(TransitAlert.samples, selectedLines: selectedLines)
            errorMessage = "Beispieldaten: Trage in den Einstellungen eine API-URL ein."
            return
        }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse,
               !(200...299).contains(httpResponse.statusCode) {
                throw URLError(.badServerResponse)
            }

            alerts = filter(try decodeAlerts(from: data), selectedLines: selectedLines)
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

    private func decodeAlerts(from data: Data) throws -> [TransitAlert] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        if let response = try? decoder.decode(AlertResponse.self, from: data) {
            return response.alerts
        }

        return try decoder.decode([TransitAlert].self, from: data)
    }
}
