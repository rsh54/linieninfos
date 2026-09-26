const DEFAULT_LINES = ["3", "7", "9", "10"];
const LINES_STORAGE_KEY = "uestra-lines";
const STOP_STORAGE_KEY = "uestra-stop";
const STOP_FAVORITES_STORAGE_KEY = "linienblick-stop-favorites";
const STOP_CHOICES_PAGE_SIZE = 5;
const STOP_FAVORITES_LIMIT = 8;

const lineChips = document.querySelector("#lineChips");
const lineForm = document.querySelector("#lineForm");
const lineInput = document.querySelector("#lineInput");
const stopForm = document.querySelector("#stopForm");
const stopInput = document.querySelector("#stopInput");
const clearStopInput = document.querySelector("#clearStopInput");
const saveStopFavorite = document.querySelector("#saveStopFavorite");
const stopFavorites = document.querySelector("#stopFavorites");
const stopChoices = document.querySelector("#stopChoices");
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
let stopState = loadStop();
let stopName = stopState.name;
let stopId = stopState.id;
let stopLocality = stopState.locality;
let stopFavoriteItems = loadStopFavorites();
let stopSearchResults = [];
let visibleStopChoices = STOP_CHOICES_PAGE_SIZE;

lineForm.addEventListener("submit", event => {
  event.preventDefault();
  addLine(lineInput.value);
});

stopForm.addEventListener("submit", event => {
  event.preventDefault();
  searchStops(stopInput.value);
});

stopInput.addEventListener("input", () => {
  renderStopInputClear();
  renderStopFavorites();
});
clearStopInput.addEventListener("click", () => {
  stopInput.value = "";
  clearStopChoices();
  renderStopInputClear();
  renderStopFavorites();
  stopInput.focus();
});

saveStopFavorite.addEventListener("click", saveCurrentStopFavorite);
refreshButton.addEventListener("click", () => refreshAll());
closeDetail.addEventListener("click", () => detailDialog.close());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

renderLines();
renderDepartures();
stopInput.value = stopName;
renderStopInputClear();
renderStopFavorites();
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
  const saved = localStorage.getItem(STOP_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && parsed.name) {
        return {
          name: String(parsed.name).trim(),
          id: String(parsed.id || "").trim(),
          locality: String(parsed.locality || "").trim()
        };
      }
    } catch {
      return { name: normalizeStop(saved), id: "", locality: localityFromStopName(saved) };
    }
  }
  return { name: normalizeStop("Paracelsusweg, Hannover"), id: "", locality: "Hannover" };
}

function saveStopState() {
  localStorage.setItem(STOP_STORAGE_KEY, JSON.stringify({ name: stopName, id: stopId, locality: stopLocality }));
}

function loadStopFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(STOP_FAVORITES_STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) {
      return saved.map(normalizeStopFavorite).filter(Boolean);
    }
  } catch {
    // Ignore invalid local storage.
  }
  return [];
}

function saveStopFavorites() {
  localStorage.setItem(STOP_FAVORITES_STORAGE_KEY, JSON.stringify(stopFavoriteItems));
}

async function searchStops(value) {
  const query = String(value || "").trim().replace(/\s+/g, " ");
  if (!query) {
    stopName = "";
    stopId = "";
    stopLocality = "";
    lines = [];
    departures = [];
    alerts = [];
    saveStopState();
    saveLines();
    stopInput.value = "";
    renderStopInputClear();
    clearStopChoices();
    renderStopFavorites();
    renderLines();
    renderDepartures("Haltestelle eintragen, um Abfahrten zu sehen.");
    renderAlerts();
    return;
  }

  setStatus("Suche Haltestellen ...");
  refreshButton.disabled = true;

  try {
    const stops = await fetchStopChoices(query);
    renderStopChoices(stops);
    if (stops.length) {
      setStatus("Bitte Haltestelle aus der Trefferliste auswählen.");
    } else {
      setStatus("Keine passende Haltestelle gefunden.", true);
    }
  } catch {
    clearStopChoices();
    setStatus("Konnte die Haltestellen nicht laden.", true);
    updatedText.textContent = "Keine Verbindung";
  } finally {
    refreshButton.disabled = false;
  }
}

async function selectStop(stop) {
  stopName = String(stop.name || "").trim();
  stopId = String(stop.id || "").trim();
  stopLocality = String(stop.locality || "").trim();
  saveStopState();
  stopInput.value = stopName;
  renderStopInputClear();
  clearStopChoices();
  renderStopFavorites();

  setStatus("Lade Linien dieser Haltestelle ...");
  refreshButton.disabled = true;

  try {
    lines = await fetchLinesForStop(currentStopQuery());
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

function currentStopQuery() {
  return stopId || stopName;
}

function isHannoverStop() {
  return stopLocality.toLocaleLowerCase("de") === "hannover";
}

function localityFromStopName(value) {
  const text = String(value || "");
  return /(?:^|,\s*)hannover\b/i.test(text) ? "Hannover" : "";
}

function renderStopChoices(stops) {
  stopSearchResults = Array.isArray(stops) ? stops : [];
  visibleStopChoices = STOP_CHOICES_PAGE_SIZE;
  renderVisibleStopChoices();
}

function renderVisibleStopChoices() {
  stopChoices.replaceChildren();
  stopChoices.hidden = !stopSearchResults.length;
  stopSearchResults.slice(0, visibleStopChoices).forEach(stop => {
    const button = document.createElement("button");
    button.className = "stop-choice";
    button.type = "button";

    const title = document.createElement("strong");
    title.textContent = stop.name || "Unbekannte Haltestelle";

    const meta = document.createElement("span");
    meta.textContent = [stop.locality, stop.products].filter(Boolean).join(" · ");

    button.append(title, meta);
    button.addEventListener("click", () => selectStop(stop));
    stopChoices.append(button);
  });

  if (visibleStopChoices < stopSearchResults.length) {
    const moreButton = document.createElement("button");
    moreButton.className = "stop-more";
    moreButton.type = "button";
    moreButton.textContent = `Mehr (${stopSearchResults.length - visibleStopChoices})`;
    moreButton.addEventListener("click", () => {
      visibleStopChoices += STOP_CHOICES_PAGE_SIZE;
      renderVisibleStopChoices();
    });
    stopChoices.append(moreButton);
  }
}

function clearStopChoices() {
  stopSearchResults = [];
  visibleStopChoices = STOP_CHOICES_PAGE_SIZE;
  stopChoices.replaceChildren();
  stopChoices.hidden = true;
}

function renderStopInputClear() {
  clearStopInput.hidden = !stopInput.value;
}

function saveCurrentStopFavorite() {
  const favorite = normalizeStopFavorite({ name: stopName, id: stopId, locality: stopLocality, lines });
  if (!favorite) {
    return;
  }

  stopFavoriteItems = [
    favorite,
    ...stopFavoriteItems.filter(item => stopFavoriteKey(item) !== stopFavoriteKey(favorite))
  ].slice(0, STOP_FAVORITES_LIMIT);
  saveStopFavorites();
  renderStopFavorites();
}

async function selectStopFavorite(favorite) {
  const normalized = normalizeStopFavorite(favorite);
  if (!normalized) {
    return;
  }

  if (!normalized.lines.length) {
    selectStop(normalized);
    return;
  }

  stopName = normalized.name;
  stopId = normalized.id;
  stopLocality = normalized.locality;
  lines = [...normalized.lines];
  saveStopState();
  saveLines();
  stopInput.value = stopName;
  renderStopInputClear();
  clearStopChoices();
  renderStopFavorites();
  renderLines();
  await refreshAll();
}

function removeStopFavorite(favorite) {
  const key = stopFavoriteKey(favorite);
  stopFavoriteItems = stopFavoriteItems.filter(item => stopFavoriteKey(item) !== key);
  saveStopFavorites();
  renderStopFavorites();
}

function renderStopFavorites() {
  stopFavorites.replaceChildren();
  stopFavorites.hidden = !stopFavoriteItems.length;

  const currentKey = stopFavoriteKey({ name: stopName, id: stopId, locality: stopLocality });
  const savedFavorite = stopFavoriteItems.find(item => stopFavoriteKey(item) === currentKey);
  const hasSameLines = savedFavorite ? linesKey(savedFavorite.lines) === linesKey(lines) : false;
  const inputMatchesStop = normalizeStop(stopInput.value) === stopName;
  saveStopFavorite.disabled = !stopName || !inputMatchesStop || hasSameLines;
  saveStopFavorite.textContent = hasSameLines ? "Favorit gespeichert" : savedFavorite ? "Favorit aktualisieren" : "Favorit speichern";

  stopFavoriteItems.forEach(favorite => {
    const chip = document.createElement("span");
    chip.className = "favorite-chip";

    const button = document.createElement("button");
    button.className = "favorite-select";
    button.type = "button";
    button.textContent = favorite.name;
    button.title = favorite.lines.length ? `${favorite.name}: ${favorite.lines.join(", ")}` : favorite.name;
    button.addEventListener("click", () => selectStopFavorite(favorite));

    const removeButton = document.createElement("button");
    removeButton.className = "favorite-remove";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.ariaLabel = `${favorite.name} aus Favoriten entfernen`;
    removeButton.addEventListener("click", () => removeStopFavorite(favorite));

    chip.append(button, removeButton);
    stopFavorites.append(chip);
  });
}

function normalizeStopFavorite(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const name = String(value.name || "").trim();
  if (!name) {
    return null;
  }

  return {
    name,
    id: String(value.id || "").trim(),
    locality: String(value.locality || "").trim(),
    lines: Array.isArray(value.lines) ? value.lines.map(normalizeLine).filter(Boolean).sort(lineSort) : []
  };
}

function stopFavoriteKey(value) {
  const favorite = normalizeStopFavorite(value);
  return favorite ? (favorite.id || `${favorite.locality}|${favorite.name}`).toLocaleLowerCase("de") : "";
}

function linesKey(value) {
  return Array.isArray(value) ? value.map(normalizeLine).filter(Boolean).sort(lineSort).join("|") : "";
}

function normalizeStop(value) {
  const stop = String(value || "").trim().replace(/\s+/g, " ");
  return stop;
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
    const payload = await fetchDeparturesForStop(currentStopQuery(), lines);
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

async function fetchStopChoices(queryText) {
  const query = new URLSearchParams({
    type: "stop-search",
    query: queryText
  });
  const response = await fetch(`api.php?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.stops) ? payload.stops : [];
}

async function refreshAlerts() {
  if (!lines.length) {
    alerts = [];
    renderAlerts();
    return;
  }
  if (!isHannoverStop()) {
    alerts = [];
    renderAlerts("Verkehrsmeldungen nur für Hannover.");
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
  sortDepartures(departures).forEach(departure => {
    const platform = platformKey(departure.platform);
    if (platform !== previousPlatform) {
      const platformRow = document.createElement("div");
      platformRow.className = previousPlatform ? "departure-platform-heading platform-change" : "departure-platform-heading";
      platformRow.textContent = platformLabel(platform);
      table.append(platformRow);
    }

    const row = document.createElement("article");
    row.className = "departure-row";
    row.innerHTML = `
      <div class="departure-time">${escapeHTML(departure.minutesText)}</div>
      <div class="departure-delay">${escapeHTML(departure.delayText || "")}</div>
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

function platformLabel(value) {
  const platform = platformKey(value);
  return /^\d+$/u.test(platform) ? `Gleis ${platform}` : platform;
}

function destinationKey(value) {
  return String(value || "").trim().toLocaleLowerCase("de");
}

function renderAlerts(message) {
  alertsList.replaceChildren();
  alertCount.textContent = String(alerts.length);

  if (!alerts.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = message || "Keine Meldungen für deine Linien.";
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
