import Foundation

enum AlertSeverity: String, Codable, CaseIterable, Identifiable {
    case info
    case delay
    case disruption
    case cancellation

    var id: String { rawValue }

    var label: String {
        switch self {
        case .info: "Info"
        case .delay: "Verspätung"
        case .disruption: "Störung"
        case .cancellation: "Ausfall"
        }
    }
}

struct TransitAlert: Identifiable, Codable, Equatable {
    let id: String
    let line: String
    let title: String
    let detail: String
    let severity: AlertSeverity
    let updatedAt: Date
    let url: URL?

    var lineLabel: String {
        "Linie \(line)"
    }
}

struct AlertResponse: Decodable {
    let alerts: [TransitAlert]
}

extension TransitAlert {
    static let samples: [TransitAlert] = [
        TransitAlert(
            id: "sample-7",
            line: "7",
            title: "Einschränkungen zwischen Wallensteinstraße und Wettbergen",
            detail: "Zwischen einzelnen Haltestellen kann es zu Ersatzverkehr und längeren Fahrzeiten kommen.",
            severity: .disruption,
            updatedAt: Date(),
            url: URL(string: "https://www.uestra.de/aktuelles/neuigkeiten/aktuelle-meldungen/")
        ),
        TransitAlert(
            id: "sample-10",
            line: "10",
            title: "Fahrplanabweichungen im Innenstadtbereich",
            detail: "Bitte prüfe vor Fahrtbeginn die aktuelle Verbindung.",
            severity: .delay,
            updatedAt: Date().addingTimeInterval(-1_800),
            url: URL(string: "https://www.uestra.de/")
        )
    ]
}
