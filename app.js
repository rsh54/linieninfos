const DEFAULT_LINES = ["3", "7", "9", "10"];
const LINES_STORAGE_KEY = "uestra-lines";
const STOP_STORAGE_KEY = "uestra-stop";

const lineChips = document.querySelector("#lineChips");
const lineForm = document.querySelector("#lineForm");
const lineInput = document.querySelector("#lineInput");
const stopForm = document.querySelector("#stopForm");
const stopInput = document.querySelector("#stopInput");
const statusBox = document.querySelector("#statusBox");
const departuresList = document.querySelector("#departuresList");
const departureCount = document.querySelector("#departureCount");
const alertsList = document.querySelector("#alertsList");
const alertCount = document.querySelector("#alertCount");
const updatedText = document.querySelector("#updatedText");
const refreshButton = document.querySelector("#refreshButton");
const detailDialog = document.querySelector("#detailDialog");
const detailContent = document.querySelector("#detailContent");
const closeDetail = document.querySelector("#closeDetail");

let lines = loadLines();
let alerts = [];
let departures = [];
let stopName = loadStop();

lineForm.addEventListener("submit", event => {
  event.preventDefault();
  addLine(lineInput.value);
});

stopForm.addEventListener("submit", event => {
  event.preventDefault();
  saveStop(stopInput.value);
});

refreshButton.addEventListener("click", () => refreshAll());
closeDetail.addEventListener("click", () => detailDialog.close());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

renderLines();
renderDepartures();
stopInput.value = stopName;
refreshAll();

function loadLines() {
  try {
    const saved = JSON.parse(localStorage.getItem(LINES_STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length) {
      return saved.map(normalizeLine).filter(Boolean);
    }
  } catch {
    // Ignore invalid local storage.
  }
  return [...DEFAULT_LINES];
}

function saveLines() {
  localStorage.setItem(LINES_STORAGE_KEY, JSON.stringify(lines));
}

function loadStop() {
  return normalizeStop(localStorage.getItem(STOP_STORAGE_KEY) || "Paracelsusweg");
}

async function saveStop(value) {
  stopName = normalizeStop(value);
  localStorage.setItem(STOP_STORAGE_KEY, stopName);
  stopInput.value = stopName;

  if (!stopName) {
    lines = [];
    departures = [];
    alerts = [];
    saveLines();
    renderLines();
    renderDepartures("Haltestelle eintragen, um Abfahrten zu sehen.");
    renderAlerts();
    return;
  }

  setStatus("Lade Linien dieser Haltestelle ...");
  refreshButton.disabled = true;

  try {
    lines = await fetchLinesForStop(stopName);
    saveLines();
    renderLines();
    if (lines.length) {
      await refreshAll();
    } else {
      departures = [];
      alerts = [];
      renderDepartures("Keine Linien für diese Haltestelle gefunden.");
      renderAlerts();
      clearStatus();
      updatedText.textContent = `Aktualisiert ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    }
  } catch {
    lines = [];
    departures = [];
    alerts = [];
    saveLines();
    renderLines();
    renderDepartures("Konnte die Linien dieser Haltestelle nicht laden.");
    renderAlerts();
    setStatus("Konnte die Linien dieser Haltestelle nicht laden.", true);
    updatedText.textContent = "Keine Verbindung";
  } finally {
    refreshButton.disabled = false;
  }
}

function normalizeStop(value) {
  const stop = String(value || "").trim().replace(/\s+/g, " ");
  if (!stop) return "";
  return stop.includes(",") ? stop : `${stop}, Hannover`;
}

function normalizeLine(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function addLine(value) {
  const line = normalizeLine(value);
  if (!line || lines.includes(line)) {
    lineInput.value = "";
    return;
  }
  lines = [...lines, line].sort(lineSort);
  lineInput.value = "";
  saveLines();
  renderLines();
  refreshAll();
}

function removeLine(line) {
  lines = lines.filter(item => item !== line);
  saveLines();
  renderLines();
  refreshAll();
}

function renderLines() {
  lineChips.replaceChildren();
  lines.forEach(line => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = line;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "×";
    button.ariaLabel = `Linie ${line} entfernen`;
    button.addEventListener("click", () => removeLine(line));

    chip.append(button);
    lineChips.append(chip);
  });
}

async function refreshAll() {
  setStatus("Lade Abfahrten und Meldungen ...");
  refreshButton.disabled = true;

  try {
    await Promise.all([refreshDepartures(), refreshAlerts()]);
    clearStatus();
    updatedText.textContent = `Aktualisiert ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    setStatus("Konnte nicht alle Daten laden.", true);
    updatedText.textContent = "Keine Verbindung";
  } finally {
    refreshButton.disabled = false;
  }
}

async function refreshDepartures() {
  if (!stopName) {
    departures = [];
    renderDepartures("Haltestelle eintragen, um Abfahrten zu sehen.");
    return;
  }
  if (!lines.length) {
    departures = [];
    renderDepartures("Keine Linien ausgewählt.");
    return;
  }

  try {
    const payload = await fetchDeparturesForStop(stopName, lines);
    departures = Array.isArray(payload.departures) ? payload.departures : [];
    renderDepartures(payload.message);
  } catch {
    departures = [];
    renderDepartures("Konnte die Abfahrten nicht laden.");
  }
}

async function fetchDeparturesForStop(stop, selectedLines, includeAllLines = false) {
  const query = new URLSearchParams({
    type: "departures",
    stop
  });
  if (selectedLines.length) {
    query.set("lines", selectedLines.join(","));
  } else if (!includeAllLines) {
    query.set("lines", "__none__");
  }
  const response = await fetch(`api.php?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchLinesForStop(stop) {
  const query = new URLSearchParams({
    type: "stop-lines",
    stop
  });
  const response = await fetch(`api.php?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (Array.isArray(payload.lines) && payload.lines.length) {
    return payload.lines.map(normalizeLine).filter(Boolean).sort(lineSort);
  }
  if (Array.isArray(payload.lines)) {
    return [];
  }
  throw new Error("Invalid stop-lines response");
}

async function refreshAlerts() {
  if (!lines.length) {
    alerts = [];
    renderAlerts();
    return;
  }

  try {
    const query = new URLSearchParams({
      type: "alerts",
      lines: lines.join(",")
    });
    const response = await fetch(`api.php?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
    renderAlerts();
  } catch {
    alerts = [];
    renderAlerts();
  }
}

function renderDepartures(message) {
  departuresList.replaceChildren();
  departureCount.textContent = String(departures.length);

  if (!departures.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = message || "Keine Abfahrten für diese Haltestelle und Linien.";
    departuresList.append(empty);
    return;
  }

  const table = document.createElement("div");
  table.className = "departure-table";

  let previousPlatform = "";
  sortDepartures(departures).forEach((departure, index) => {
    const platform = platformKey(departure.platform);
    const row = document.createElement("article");
    row.className = index > 0 && platform !== previousPlatform ? "departure-row platform-change" : "departure-row";
    row.innerHTML = `
      <div class="departure-platform">${escapeHTML(platform)}</div>
      <div class="departure-time">${escapeHTML(departure.minutesText)}</div>
      <div class="departure-line">${escapeHTML(departure.line)}</div>
      <div class="departure-destination">${escapeHTML(departure.destination)}</div>
    `;
    previousPlatform = platform;
    table.append(row);
  });

  departuresList.append(table);
}

function sortDepartures(items) {
  return [...items].sort((a, b) => {
    const platformComparison = lineSort(platformKey(a.platform), platformKey(b.platform));
    if (platformComparison !== 0) return platformComparison;

    const timeComparison = (a.minutes ?? 0) - (b.minutes ?? 0);
    if (timeComparison !== 0) return timeComparison;

    const lineComparison = lineSort(a.line, b.line);
    if (lineComparison !== 0) return lineComparison;

    return destinationKey(a.destination).localeCompare(destinationKey(b.destination), "de");
  });
}

function platformKey(value) {
  const platform = String(value || "").trim();
  return platform || "ohne Steig";
}

function destinationKey(value) {
  return String(value || "").trim().toLocaleLowerCase("de");
}

function renderAlerts() {
  alertsList.replaceChildren();
  alertCount.textContent = String(alerts.length);

  if (!alerts.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Keine Meldungen für deine Linien.";
    alertsList.append(empty);
    return;
  }

  alerts.forEach(alert => {
    const card = document.createElement("button");
    card.className = "alert-card";
    card.type = "button";
    card.addEventListener("click", () => openDetail(alert));

    card.innerHTML = `
      <div class="alert-meta">
        <span class="line-badge">Linie ${escapeHTML(alert.line)}</span>
        <span class="severity ${escapeHTML(alert.severity || "info")}">${severityLabel(alert.severity)}</span>
      </div>
      <h3>${escapeHTML(alert.title)}</h3>
      <p>${escapeHTML(alert.detail || alert.title)}</p>
    `;
    alertsList.append(card);
  });
}

function openDetail(alert) {
  detailContent.innerHTML = `
    <div class="alert-meta">
      <span class="line-badge">Linie ${escapeHTML(alert.line)}</span>
      <span class="severity ${escapeHTML(alert.severity || "info")}">${severityLabel(alert.severity)}</span>
    </div>
    <h3>${escapeHTML(alert.title)}</h3>
    <p>${escapeHTML(alert.detail || alert.title)}</p>
    ${alert.url ? `<a href="${escapeAttribute(alert.url)}" target="_blank" rel="noopener">Quelle öffnen</a>` : ""}
  `;
  detailDialog.showModal();
}

function setStatus(message, isError = false) {
  statusBox.hidden = false;
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}

function clearStatus() {
  statusBox.hidden = true;
  statusBox.textContent = "";
  statusBox.classList.remove("error");
}

function severityLabel(severity) {
  return {
    cancellation: "Ausfall",
    disruption: "Störung",
    delay: "Verspätung",
    info: "Info"
  }[severity] || "Info";
}

function lineSort(a, b) {
  const parsedA = parseLineForSort(a);
  const parsedB = parseLineForSort(b);

  if (parsedA.prefix !== parsedB.prefix) {
    return parsedA.prefix.localeCompare(parsedB.prefix, "de");
  }
  if (parsedA.number !== parsedB.number) {
    return parsedA.number - parsedB.number;
  }
  return parsedA.suffix.localeCompare(parsedB.suffix, "de");
}

function parseLineForSort(value) {
  const line = String(value || "").trim().toUpperCase();
  const match = line.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!match) {
    return { prefix: line, number: Number.MAX_SAFE_INTEGER, suffix: "" };
  }
  return {
    prefix: match[1],
    number: Number.parseInt(match[2], 10),
    suffix: match[3]
  };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));
}

function escapeAttribute(value) {
  return escapeHTML(value).replace(/`/g, "&#096;");
}
