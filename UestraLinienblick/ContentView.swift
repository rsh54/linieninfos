import SwiftUI

struct ContentView: View {
    @StateObject private var store = AlertStore()

    @AppStorage("endpoint") private var endpoint = ""
    @AppStorage("selectedLines") private var selectedLinesStorage = "3,7,9,10"

    @State private var isShowingSettings = false
    @State private var newLine = ""
    private let lineColumns = [GridItem(.adaptive(minimum: 72), spacing: 8, alignment: .leading)]

    private var selectedLines: Set<String> {
        Set(selectedLinesStorage
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty })
    }

    var body: some View {
        NavigationStack {
            List {
                linesSection
                statusSection
                alertsSection
            }
            .listStyle(.insetGrouped)
            .navigationTitle("ÜSTRA Linienblick")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        isShowingSettings = true
                    } label: {
                        Label("Einstellungen", systemImage: "gearshape")
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await store.refresh(endpoint: endpoint, selectedLines: selectedLines) }
                    } label: {
                        Label("Aktualisieren", systemImage: "arrow.clockwise")
                    }
                    .disabled(store.isLoading)
                }
            }
            .refreshable {
                await store.refresh(endpoint: endpoint, selectedLines: selectedLines)
            }
            .sheet(isPresented: $isShowingSettings) {
                SettingsView(endpoint: $endpoint)
            }
            .task {
                await store.refresh(endpoint: endpoint, selectedLines: selectedLines)
            }
            .onChange(of: selectedLinesStorage) {
                Task { await store.refresh(endpoint: endpoint, selectedLines: selectedLines) }
            }
        }
    }

    private var linesSection: some View {
        Section("Beobachtete Linien") {
            LazyVGrid(columns: lineColumns, alignment: .leading, spacing: 8) {
                ForEach(selectedLines.sorted(), id: \.self) { line in
                    HStack(spacing: 6) {
                        Text(line)
                            .font(.headline)
                        Button {
                            removeLine(line)
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Linie \(line) entfernen")
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.tint.opacity(0.12), in: Capsule())
                }
            }

            HStack {
                TextField("Linie hinzufügen", text: $newLine)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.numbersAndPunctuation)

                Button {
                    addLine()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .imageScale(.large)
                }
                .disabled(newLine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private var statusSection: some View {
        Section {
            if store.isLoading {
                Label("Lade aktuelle Meldungen ...", systemImage: "clock")
            } else if let message = store.errorMessage {
                Label(message, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
            } else if store.alerts.isEmpty {
                Label("Keine Meldungen für deine Linien.", systemImage: "checkmark.circle")
                    .foregroundStyle(.green)
            }

            if let lastRefresh = store.lastRefresh {
                Text("Zuletzt aktualisiert: \(lastRefresh.formatted(date: .omitted, time: .shortened))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var alertsSection: some View {
        Section("Meldungen") {
            ForEach(store.alerts) { alert in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(alert.lineLabel)
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(severityColor(alert.severity).opacity(0.15), in: Capsule())

                        Text(alert.severity.label)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(severityColor(alert.severity))

                        Spacer()
                    }

                    Text(alert.title)
                        .font(.headline)

                    Text(alert.detail)
                        .foregroundStyle(.secondary)

                    HStack {
                        Text(alert.updatedAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Spacer()

                        if let url = alert.url {
                            Link("Details", destination: url)
                                .font(.caption.weight(.semibold))
                        }
                    }
                }
                .padding(.vertical, 6)
            }
        }
    }

    private func severityColor(_ severity: AlertSeverity) -> Color {
        switch severity {
        case .info: .blue
        case .delay: .orange
        case .disruption: .red
        case .cancellation: .purple
        }
    }

    private func addLine() {
        let line = newLine.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !line.isEmpty else { return }
        selectedLinesStorage = (selectedLines.union([line]).sorted()).joined(separator: ",")
        newLine = ""
    }

    private func removeLine(_ line: String) {
        selectedLinesStorage = selectedLines
            .filter { $0 != line }
            .sorted()
            .joined(separator: ",")
    }
}

private struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var endpoint: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Datenquelle") {
                    TextField("https://…/uestra-alerts.json", text: $endpoint, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()

                    Text("Die App erwartet JSON als Array oder als Objekt mit `alerts`. Ohne URL zeigt sie Beispieldaten.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Erwartetes JSON") {
                    Text("""
                    [
                      {
                        "id": "alert-1",
                        "line": "7",
                        "title": "Störung",
                        "detail": "Beschreibung",
                        "severity": "disruption",
                        "updatedAt": "2026-09-23T08:00:00Z",
                        "url": "https://www.uestra.de/"
                      }
                    ]
                    """)
                    .font(.system(.caption, design: .monospaced))
                }
            }
            .navigationTitle("Einstellungen")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fertig") {
                        dismiss()
                    }
                }
            }
        }
    }
}
