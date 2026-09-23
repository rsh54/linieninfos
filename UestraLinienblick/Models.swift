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
