<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

$source = 'https://www.uestra.de/aktuelles/neuigkeiten/aktuelle-meldungen/';
$requestedLines = parse_lines($_GET['lines'] ?? '');
$type = $_GET['type'] ?? 'alerts';

try {
    if ($type === 'stop-search') {
        echo json_encode([
            'stops' => search_stops((string)($_GET['query'] ?? '')),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($type === 'stop-lines') {
        echo json_encode([
            'lines' => get_stop_lines((string)($_GET['stop'] ?? '')),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($type === 'departures') {
        echo json_encode([
            'departures' => get_departures((string)($_GET['stop'] ?? ''), $requestedLines),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $items = [];
    for ($page = 1; $page <= 3; $page++) {
        $url = $page === 1 ? $source : $source . 'seite-' . $page . '/';
        $html = fetch_url($url);
        $items = array_merge($items, parse_uestra_news($html, $url));
    }

    $alerts = [];
    foreach ($items as $item) {
        if (!is_current_alert($item['title'] . ' ' . $item['detail'])) {
            continue;
        }

        $lines = lines_from_text($item['title'] . ' ' . $item['detail']);
        foreach ($lines as $line) {
            if ($requestedLines && !in_array($line, $requestedLines, true)) {
                continue;
            }

            $id = 'uestra-' . substr(sha1($item['title'] . $item['detail']), 0, 12) . '-' . $line;
            $alerts[$id] = [
                'id' => $id,
                'line' => $line,
                'title' => $item['title'],
                'detail' => $item['detail'],
                'severity' => severity_for($item['title'] . ' ' . $item['detail']),
                'updatedAt' => gmdate('c'),
                'url' => $item['url'],
            ];
        }
    }

    echo json_encode(['alerts' => array_values($alerts)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(502);
    echo json_encode(['error' => 'Daten konnten nicht geladen werden.'], JSON_UNESCAPED_UNICODE);
}

function search_stops(string $query): array
{
    $query = trim(preg_replace('/\s+/u', ' ', $query) ?? $query);
    if ($query === '') {
        return [];
    }

    $locations = [];
    foreach (stop_search_candidates($query) as $candidate) {
        foreach (['stop', 'any'] as $type) {
            $payload = fetch_departure_payload_for_candidate($candidate, $type, 1);
            foreach (($payload['locations'] ?? []) as $location) {
                if (($location['type'] ?? '') !== 'stop' || !isset($location['id'])) {
                    continue;
                }

                $id = (string)$location['id'];
                if (isset($locations[$id])) {
                    continue;
                }

                $name = clean_place_name((string)($location['name'] ?? $location['disassembledName'] ?? $id));
                $locality = (string)($location['parent']['name'] ?? $location['properties']['mainLocality'] ?? '');
                $products = product_classes_label($location['productClasses'] ?? []);

                $locations[$id] = [
                    'id' => $id,
                    'name' => $name,
                    'locality' => $locality,
                    'products' => $products,
                    'matchQuality' => (int)($location['matchQuality'] ?? 0),
                    'isBest' => (bool)($location['isBest'] ?? false),
                ];
            }
        }
    }

    $locations = array_values($locations);
    usort($locations, static function ($a, $b) {
        if ($a['isBest'] !== $b['isBest']) {
            return $a['isBest'] ? -1 : 1;
        }
        if ($a['matchQuality'] !== $b['matchQuality']) {
            return $b['matchQuality'] <=> $a['matchQuality'];
        }
        return strcmp(destination_key((string)$a['name']), destination_key((string)$b['name']));
    });

    return array_slice($locations, 0, 12);
}

function stop_search_candidates(string $query): array
{
    $candidates = [$query];
    if (strpos($query, ',') === false && !is_stop_id($query)) {
        $candidates[] = $query . ', Hannover';
        $candidates[] = 'Hannover ' . $query;
    }
    return array_values(array_unique(array_filter($candidates)));
}

function product_classes_label($classes): string
{
    if (!is_array($classes)) {
        return '';
    }
    $classes = array_map('intval', $classes);

    $labels = [];
    if (in_array(3, $classes, true)) {
        $labels[] = 'Stadtbahn';
    }
    if (in_array(5, $classes, true) || in_array(6, $classes, true)) {
        $labels[] = 'Bus';
    }
    return implode(', ', array_unique($labels));
}

function get_stop_lines(string $stop): array
{
    $stop = normalize_stop($stop);
    if ($stop === '') {
        return [];
    }

    $bestPayload = null;
    $bestScore = -1;
    foreach (departure_query_candidates($stop) as $candidate) {
        foreach (['stop', 'any'] as $type) {
            $payload = fetch_departure_payload_for_candidate($candidate, $type, 200);
            if (!isset($payload['stopEvents']) || !is_array($payload['stopEvents'])) {
                continue;
            }

            $score = stop_lines_payload_score($payload);
            if ($score > $bestScore) {
                $bestPayload = $payload;
                $bestScore = $score;
            }
        }
    }

    if ($bestPayload === null) {
        return [];
    }

    $lines = stop_lines_from_payload($bestPayload);
    uasort($lines, 'compare_lines');
    return array_values($lines);
}

function stop_lines_payload_score(array $payload): int
{
    $tramCount = 0;
    $totalCount = 0;
    foreach ($payload['stopEvents'] ?? [] as $event) {
        $transport = $event['transportation'] ?? [];
        $line = normalize_line((string)($transport['number'] ?? $transport['disassembledName'] ?? ''));
        if ($line === '') {
            continue;
        }

        $totalCount++;
        $product = $transport['product'] ?? [];
        if ((int)($product['class'] ?? -1) === 3 || stripos((string)($product['name'] ?? ''), 'stadtbahn') !== false) {
            $tramCount++;
        }
    }

    return ($tramCount * 1000) + $totalCount;
}

function stop_lines_from_payload(array $payload): array
{
    $allLines = [];

    foreach ($payload['stopEvents'] ?? [] as $event) {
        $transport = $event['transportation'] ?? [];
        $line = normalize_line((string)($transport['number'] ?? $transport['disassembledName'] ?? ''));
        if ($line === '') {
            continue;
        }

        $allLines[$line] = $line;
    }

    return $allLines;
}

function get_departures(string $stop, array $requestedLines): array
{
    $stop = normalize_stop($stop);
    if ($stop === '') {
        return [];
    }

    $payload = fetch_departure_payload($stop, $requestedLines);
    if ($payload === null) {
        return [];
    }

    $departures = [];
    foreach ($payload['stopEvents'] as $event) {
        $transport = $event['transportation'] ?? [];
        $line = normalize_line((string)($transport['number'] ?? $transport['disassembledName'] ?? ''));
        if ($line === '') {
            continue;
        }
        if ($requestedLines && !in_array($line, $requestedLines, true)) {
            continue;
        }

        $time = (string)($event['departureTimeEstimated'] ?? $event['departureTimePlanned'] ?? '');
        $timestamp = strtotime($time);
        if ($timestamp === false) {
            continue;
        }

        $minutes = max(0, (int)round(($timestamp - time()) / 60));
        $destination = $transport['destination']['name'] ?? ($transport['destination']['disassembledName'] ?? '');
        $location = $event['location'] ?? [];
        $properties = $event['properties'] ?? [];
        $locationProperties = $location['properties'] ?? [];

        $departures[] = [
            'line' => $line,
            'destination' => clean_place_name((string)$destination),
            'stopName' => clean_place_name((string)($location['name'] ?? $stop)),
            'plannedTime' => $event['departureTimePlanned'] ?? null,
            'estimatedTime' => $event['departureTimeEstimated'] ?? null,
            'minutes' => $minutes,
            'minutesText' => $minutes <= 0 ? 'jetzt' : $minutes . ' min',
            'platform' => (string)($locationProperties['platform'] ?? $properties['platform'] ?? ''),
            'cancelled' => (bool)($event['isCancelled'] ?? false),
        ];
    }

    usort($departures, static function ($a, $b) {
        $lineComparison = compare_lines((string)$a['line'], (string)$b['line']);
        if ($lineComparison !== 0) {
            return $lineComparison;
        }

        $destinationComparison = strcmp(destination_key((string)$a['destination']), destination_key((string)$b['destination']));
        if ($destinationComparison !== 0) {
            return $destinationComparison;
        }

        $timeComparison = ((int)$a['minutes']) <=> ((int)$b['minutes']);
        if ($timeComparison !== 0) {
            return $timeComparison;
        }

        return compare_lines(platform_key((string)$a['platform']), platform_key((string)$b['platform']));
    });

    $limitedDepartures = limit_departures_per_line_direction($departures, 3);

    usort($limitedDepartures, static function ($a, $b) {
        $platformComparison = compare_lines(platform_key((string)$a['platform']), platform_key((string)$b['platform']));
        if ($platformComparison !== 0) {
            return $platformComparison;
        }

        $timeComparison = ((int)$a['minutes']) <=> ((int)$b['minutes']);
        if ($timeComparison !== 0) {
            return $timeComparison;
        }

        $lineComparison = compare_lines((string)$a['line'], (string)$b['line']);
        if ($lineComparison !== 0) {
            return $lineComparison;
        }

        return strcmp(destination_key((string)$a['destination']), destination_key((string)$b['destination']));
    });

    return $limitedDepartures;
}

function fetch_departure_payload(string $stop, array $requestedLines): ?array
{
    $bestPayload = null;
    $bestCount = 0;

    foreach (departure_query_candidates($stop) as $candidate) {
        foreach (['stop', 'any'] as $type) {
            $payload = fetch_departure_payload_for_candidate($candidate, $type, 60);
            if (!$requestedLines) {
                $count = isset($payload['stopEvents']) && is_array($payload['stopEvents']) ? count($payload['stopEvents']) : 0;
                if ($count > $bestCount) {
                    $bestPayload = $payload;
                    $bestCount = $count;
                }
                continue;
            }
            if (payload_has_requested_departures($payload, $requestedLines)) {
                return $payload;
            }
        }
    }

    return $bestCount > 0 ? $bestPayload : null;
}

function fetch_departure_payload_for_candidate(string $candidate, string $type, int $limit): ?array
{
    $params = [
        'outputFormat' => 'rapidJSON',
        'language' => 'de',
        'type_dm' => $type,
        'name_dm' => $candidate,
        'mode' => 'direct',
        'useRealtime' => '1',
        'limit' => (string)$limit,
    ];
    $url = 'https://efa.de/efa/XML_DM_REQUEST?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    try {
        $payload = json_decode(fetch_url($url), true);
    } catch (Throwable $error) {
        return null;
    }

    return is_array($payload) ? $payload : null;
}

function payload_has_requested_departures($payload, array $requestedLines): bool
{
    if (!isset($payload['stopEvents']) || !is_array($payload['stopEvents'])) {
        return false;
    }
    if (!$requestedLines) {
        return count($payload['stopEvents']) > 0;
    }

    foreach ($payload['stopEvents'] as $event) {
        $transport = $event['transportation'] ?? [];
        $line = normalize_line((string)($transport['number'] ?? $transport['disassembledName'] ?? ''));
        if ($line !== '' && in_array($line, $requestedLines, true)) {
            return true;
        }
    }
    return false;
}

function departure_query_candidates(string $stop): array
{
    if (is_stop_id($stop)) {
        return [$stop];
    }

    $candidates = stop_query_candidates($stop);
    foreach ($candidates as $candidate) {
        foreach (stopfinder_ids($candidate) as $id) {
            $candidates[] = $id;
        }
    }
    return array_values(array_unique(array_filter($candidates)));
}

function stop_query_candidates(string $stop): array
{
    $candidates = [$stop];

    if (strpos($stop, ',') !== false) {
        [$first, $second] = array_map('trim', explode(',', $stop, 2));
        if ($first !== '' && $second !== '') {
            $candidates[] = $second . ', ' . $first;
            $candidates[] = $second . ' ' . $first;
            $candidates[] = $first . ' ' . $second;
            if (destination_key($second) === 'hannover') {
                $candidates[] = $first;
                $candidates[] = 'Hannover ' . $first;
            }
        }
    }

    return array_values(array_unique(array_filter($candidates)));
}

function stopfinder_ids(string $query): array
{
    $params = [
        'outputFormat' => 'rapidJSON',
        'language' => 'de',
        'type_sf' => 'any',
        'name_sf' => $query,
        'locationServerActive' => '1',
        'anyMaxSizeHitList' => '10',
    ];
    $url = 'https://efa.de/efa/XML_STOPFINDER_REQUEST?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    try {
        $payload = json_decode(fetch_url($url), true);
    } catch (Throwable $error) {
        return [];
    }

    $ids = [];
    if (isset($payload['locations']) && is_array($payload['locations'])) {
        foreach ($payload['locations'] as $location) {
            if (($location['type'] ?? '') === 'stop' && isset($location['id'])) {
                $ids[] = (string)$location['id'];
            }
        }
    }

    if (isset($payload['stopFinder']) && is_array($payload['stopFinder'])) {
        foreach ($payload['stopFinder'] as $location) {
            if (($location['anyType'] ?? '') === 'stop') {
                if (isset($location['ref']['id'])) {
                    $ids[] = (string)$location['ref']['id'];
                }
                if (isset($location['stateless'])) {
                    $ids[] = (string)$location['stateless'];
                }
            }
        }
    }

    return array_values(array_unique(array_filter($ids)));
}

function limit_departures_per_line_direction(array $departures, int $limit): array
{
    $counts = [];
    $limited = [];

    foreach ($departures as $departure) {
        $key = (string)$departure['line'] . '|' . destination_key((string)$departure['destination']);
        $counts[$key] = ($counts[$key] ?? 0) + 1;
        if ($counts[$key] <= $limit) {
            $limited[] = $departure;
        }
    }

    return $limited;
}

function compare_lines(string $a, string $b): int
{
    $parsedA = parse_line_for_sort($a);
    $parsedB = parse_line_for_sort($b);

    $prefixComparison = strcmp($parsedA['prefix'], $parsedB['prefix']);
    if ($prefixComparison !== 0) {
        return $prefixComparison;
    }
    if ($parsedA['number'] !== $parsedB['number']) {
        return $parsedA['number'] <=> $parsedB['number'];
    }
    return strcmp($parsedA['suffix'], $parsedB['suffix']);
}

function parse_line_for_sort(string $line): array
{
    $line = strtoupper(trim($line));
    if (!preg_match('/^([A-Z]*)(\d+)([A-Z]*)$/', $line, $match)) {
        return ['prefix' => $line, 'number' => PHP_INT_MAX, 'suffix' => ''];
    }
    return [
        'prefix' => $match[1],
        'number' => (int)$match[2],
        'suffix' => $match[3],
    ];
}

function destination_key(string $value): string
{
    $value = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    return trim($value);
}

function platform_key(string $value): string
{
    $value = trim($value);
    return $value === '' ? 'ohne Steig' : $value;
}

function fetch_url(string $url): string
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_USERAGENT => 'UestraLinienblick/1.0',
        ]);
        $body = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        if (is_string($body) && $status >= 200 && $status < 300) {
            return $body;
        }
    }

    $context = stream_context_create([
        'http' => [
            'timeout' => 20,
            'header' => "User-Agent: UestraLinienblick/1.0\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    if (!is_string($body)) {
        throw new RuntimeException('Fetch failed');
    }
    return $body;
}

function parse_uestra_news(string $html, string $pageUrl): array
{
    $html = preg_replace('/\s+/u', ' ', $html) ?? $html;
    $blocks = explode('Verkehrsmeldungen', $html);
    array_shift($blocks);
    $items = [];

    foreach ($blocks as $block) {
        if (!preg_match('/<h3[^>]*>(.*?)<\/h3>/isu', $block, $titleMatch)) {
            continue;
        }

        preg_match('/<p[^>]*>(.*?)<\/p>/isu', $block, $detailMatch);
        preg_match('/<a[^>]+href="([^"]+)"/isu', $block, $hrefMatch);

        $title = clean_html($titleMatch[1]);
        $detail = isset($detailMatch[1]) ? clean_html($detailMatch[1]) : $title;
        $url = isset($hrefMatch[1]) ? absolute_url($hrefMatch[1], $pageUrl) : $pageUrl;

        if ($title !== '') {
            $items[] = ['title' => $title, 'detail' => $detail, 'url' => $url];
        }
    }

    return $items;
}

function is_current_alert(string $text): bool
{
    $dates = dates_from_text($text);
    if (count($dates) < 2 && !preg_match('/\bbis\b/iu', $text)) {
        return true;
    }
    if (!$dates) {
        return true;
    }

    $latest = max($dates);
    $today = strtotime('today');
    return $latest >= $today;
}

function dates_from_text(string $text): array
{
    $dates = [];
    $months = [
        'januar' => 1, 'jan' => 1,
        'februar' => 2, 'feb' => 2,
        'märz' => 3, 'maerz' => 3, 'mrz' => 3,
        'april' => 4, 'apr' => 4,
        'mai' => 5,
        'juni' => 6, 'jun' => 6,
        'juli' => 7, 'jul' => 7,
        'august' => 8, 'aug' => 8,
        'september' => 9, 'sep' => 9,
        'oktober' => 10, 'okt' => 10,
        'november' => 11, 'nov' => 11,
        'dezember' => 12, 'dez' => 12,
    ];
    $year = (int)date('Y');

    if (preg_match_all('/\b(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{2,4}))?/u', $text, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $day = (int)$match[1];
            $month = (int)$match[2];
            $matchYear = isset($match[3]) && $match[3] !== '' ? normalize_year((int)$match[3]) : $year;
            $timestamp = timestamp_for_date($matchYear, $month, $day);
            if ($timestamp !== null) {
                $dates[] = $timestamp;
            }
        }
    }

    if (preg_match_all('/\b(\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+)(?:\s+(\d{4}))?/u', $text, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $monthName = normalize_month_name($match[2]);
            if (!isset($months[$monthName])) {
                continue;
            }
            $day = (int)$match[1];
            $matchYear = isset($match[3]) && $match[3] !== '' ? (int)$match[3] : $year;
            $timestamp = timestamp_for_date($matchYear, $months[$monthName], $day);
            if ($timestamp !== null) {
                $dates[] = $timestamp;
            }
        }
    }

    if (preg_match_all('/\b(\d{1,2})\.\s*(?:bis|-|–)\s*(?:zum\s+)?(\d{1,2})\.\s*([A-Za-zäöüÄÖÜß]+|\d{1,2})/iu', $text, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $monthToken = normalize_month_name($match[3]);
            $month = is_numeric($monthToken) ? (int)$monthToken : ($months[$monthToken] ?? null);
            if ($month === null) {
                continue;
            }
            foreach ([(int)$match[1], (int)$match[2]] as $day) {
                $timestamp = timestamp_for_date($year, $month, $day);
                if ($timestamp !== null) {
                    $dates[] = $timestamp;
                }
            }
        }
    }

    return array_values(array_unique($dates));
}

function normalize_month_name(string $value): string
{
    $value = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    return str_replace(['ä'], ['ae'], trim($value, ". \t\n\r\0\x0B"));
}

function normalize_year(int $year): int
{
    return $year < 100 ? 2000 + $year : $year;
}

function timestamp_for_date(int $year, int $month, int $day): ?int
{
    if (!checkdate($month, $day, $year)) {
        return null;
    }
    return strtotime(sprintf('%04d-%02d-%02d 23:59:59', $year, $month, $day));
}

function lines_from_text(string $text): array
{
    $lines = [];
    $patterns = [
        '/\b(?:Stadtbahn|Bus)?linie(?:n)?\s+([A-Za-z]?\d{1,3}[A-Za-z]?)\b/iu',
        '/\b(?:Stadtbahn|Bus)?linie(?:n)?\s+((?:[A-Za-z]?\d{1,3}[A-Za-z]?\s*(?:,|und|oder|\/|\+)?\s*){2,})/iu',
        '/\bauf (?:den )?(?:Stadtbahn|Bus)?linie(?:n)?\s+((?:[A-Za-z]?\d{1,3}[A-Za-z]?\s*(?:,|und|oder|\/|\+)?\s*){1,})/iu',
        '/\bauf folgenden Linien:\s*([^.;]+)/iu',
    ];

    foreach ($patterns as $pattern) {
        if (!preg_match_all($pattern, $text, $matches)) {
            continue;
        }
        foreach ($matches[1] as $match) {
            foreach (preg_split('/,|\/|\bund\b|\s+/iu', $match) ?: [] as $part) {
                $line = strtoupper(trim($part));
                if (preg_match('/^[A-Z]?\d{1,3}[A-Z]?$/u', $line)) {
                    $lines[$line] = $line;
                }
            }
        }
    }

    return array_values($lines);
}

function parse_lines(string $value): array
{
    $lines = [];
    foreach (preg_split('/[,;\s]+/u', $value) ?: [] as $part) {
        $line = strtoupper(trim($part));
        if ($line !== '') {
            $lines[] = $line;
        }
    }
    return array_values(array_unique($lines));
}

function normalize_line(string $value): string
{
    $value = strtoupper(trim($value));
    $value = preg_replace('/\s+/u', '', $value) ?? $value;
    return $value;
}

function normalize_stop(string $value): string
{
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    if ($value === '') {
        return '';
    }
    if (is_stop_id($value)) {
        return $value;
    }
    return strpos($value, ',') === false ? $value . ', Hannover' : $value;
}

function is_stop_id(string $value): bool
{
    return preg_match('/^[a-z]{2}:\d+:\d+/iu', trim($value)) === 1;
}

function clean_place_name(string $value): string
{
    $value = trim($value);
    $value = preg_replace('/^Hannover[\/ ]/u', '', $value) ?? $value;
    return $value;
}

function severity_for(string $text): string
{
    $lower = function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
    if (contains_any($lower, ['ausfall', 'entfällt', 'entfallen', 'streik'])) {
        return 'cancellation';
    }
    if (contains_any($lower, ['ersatzverkehr', 'umleitung', 'gesperrt', 'sperrung', 'störung'])) {
        return 'disruption';
    }
    if (contains_any($lower, ['verspät', 'verzöger'])) {
        return 'delay';
    }
    return 'info';
}

function contains_any(string $text, array $needles): bool
{
    foreach ($needles as $needle) {
        if (strpos($text, $needle) !== false) {
            return true;
        }
    }
    return false;
}

function clean_html(string $value): string
{
    $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $value = strip_tags($value);
    return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
}

function absolute_url(string $href, string $base): string
{
    if (preg_match('/^https?:\/\//i', $href)) {
        return $href;
    }
    if (strpos($href, '/') === 0) {
        $parts = parse_url($base);
        return ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? 'www.uestra.de') . $href;
    }
    return rtrim($base, '/') . '/' . $href;
}
