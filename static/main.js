// --- SORTIER-GEDÄCHTNIS ---
let currentSortKey = 'name';
let sortAscending = true;

// Wird aufgerufen, wenn du auf einen Spaltenkopf klickst
function setSort(key) {
    if (currentSortKey === key) {
        sortAscending = !sortAscending;
    } else {
        currentSortKey = key;
        sortAscending = (key === 'name');
    }

    updateSortArrows();
    fetchLiveDaten();
}

// Malt die kleinen Pfeile (▲/▼) in die Kopfzeile
function updateSortArrows() {
    // Erstmal alle Pfeile löschen
    document.querySelectorAll('.sort-arrow').forEach(el => el.innerHTML = '');
    // Dann beim aktiven Feld den Pfeil setzen – in ALLEN Tabellen
    // (per data-sort statt id, da derselbe Schlüssel mehrfach vorkommt)
    document.querySelectorAll(`.sort-arrow[data-sort="${currentSortKey}"]`).forEach(el => {
        el.innerHTML = sortAscending ? '▲' : '▼';
    });
}

// Sortiert unsere Datenliste
function sortMiners(minersArray) {
    return minersArray.sort((a, b) => {
        if (!a.daten) return 1;
        if (!b.daten) return -1;

        let valA, valB;

        // Je nachdem, worauf du geklickt hast, holen wir den richtigen Wert zum Vergleichen
        switch (currentSortKey) {
            case 'name': valA = a.info.name.toLowerCase(); valB = b.info.name.toLowerCase(); break;
            case 'coin': valA = (a.info.coin || "").toLowerCase(); valB = (b.info.coin || "").toLowerCase(); break;
            case 'hashRate': valA = a.daten.hashRate; valB = b.daten.hashRate; break;
            case 'power': valA = a.daten.power; valB = b.daten.power; break;
            case 'energie': valA = a.energie_kwh || 0; valB = b.energie_kwh || 0; break;
            case 'temp': valA = a.daten.temp; valB = b.daten.temp; break;
            case 'bestDiff': valA = a.daten.bestDiff; valB = b.daten.bestDiff; break;
            case 'uptime': valA = a.daten.uptimeSeconds; valB = b.daten.uptimeSeconds; break;
            default: valA = a.info.name; valB = b.info.name;
        }

        if (valA < valB) return sortAscending ? -1 : 1;
        if (valA > valB) return sortAscending ? 1 : -1;
        return 0;
    });
}

// Formatiert GH/s in TH/s
function formatTHs(ghs) {
    if (!ghs) return "0.00 TH/s";
    return (ghs / 1000).toFixed(2) + " TH/s";
}

// Berechnet die Effizienz in J/TH (Watt pro TH/s)
function calcEfficiency(power, ghs) {
    if (!ghs || ghs <= 0) return "0 J/TH";
    let ths = ghs / 1000;
    return (power / ths).toFixed(1) + " J/TH";
}

// Formatiert die Uptime (Sekunden) in Stunden und Minuten
function formatUptime(seconds) {
    if (!seconds || seconds <= 0) return "0m";

    // Die Mathematik dahinter (mit Abrunden)
    let y = Math.floor(seconds / 31536000); // 1 Jahr = 365 Tage
    let d = Math.floor((seconds % 31536000) / 86400); // 1 Tag = 86400 Sekunden
    let h = Math.floor((seconds % 86400) / 3600); // 1 Stunde = 3600 Sekunden
    let m = Math.floor((seconds % 3600) / 60); // 1 Minute = 60 Sekunden

    // Text zusammenbauen (nur anzeigen, was auch größer als 0 ist)
    let result = "";
    if (y > 0) result += y + "y ";
    if (d > 0) result += d + "d ";
    if (h > 0) result += h + "h ";
    result += m + "m";

    return result.trim();
}

// Macht riesige Zahlen (wie die Difficulty) mit Tausendertrennzeichen lesbar
function formatNumber(num) {
    if (!num) return "0";
    return num.toLocaleString('de-DE');
}

// Kleiner Ampel-Kreis vor einem Wert: grün (gut) / orange (mittel) / rot (schlecht).
// Konvention hier: höherer Wert = schlechter (gilt für Temperatur und J/TH-Effizienz).
function ampelDot(wert, gruenMax, orangeMax) {
    let farbe = (wert < gruenMax) ? '#28a745' : (wert < orangeMax ? '#ffa000' : '#ff4d4d');
    return `<span class="ampel" style="background:${farbe};"></span>`;
}

// Füllt die Übersichtsleiste (KPIs) aus allen Live-Daten
function updateKpi(alleMiner) {
    const el = document.getElementById('kpi-leiste');
    if (!el) return;

    const gesamt = alleMiner.length;
    const online = alleMiner.filter(m => m.daten).length;
    let hashSum = 0, powerSum = 0;
    alleMiner.forEach(m => {
        if (m.daten) {
            hashSum += m.daten.hashRate || 0;
            powerSum += m.daten.power || 0;
        }
    });
    const jetzt = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    el.innerHTML = `
        <div class="kpi"><span class="kpi-label">Miner online</span><span class="kpi-wert">${online} / ${gesamt}</span></div>
        <div class="kpi"><span class="kpi-label">Gesamt-Hashrate</span><span class="kpi-wert">${(hashSum / 1000).toFixed(2)} TH/s</span></div>
        <div class="kpi"><span class="kpi-label">Verbrauch</span><span class="kpi-wert">${Math.round(powerSum)} W</span></div>
        <div class="kpi"><span class="kpi-label">Aktualisiert</span><span class="kpi-wert">${jetzt}</span></div>
    `;
}

// Baut den HTML-Code für EINE Tabellenzeile
function buildRowHTML(minerInfo, minerDaten, isSolo, energieKwh) {
    if (!minerDaten) {
        let colspan = isSolo ? 10 : 9;
        return `<tr class="row-offline">
            <td><strong>${minerInfo.name}</strong><br><small>${minerInfo.ip}</small></td>
            <td class="detail-spalte"><strong>${minerInfo.coin || 'Unbekannt'}</strong></td>
            <td colspan="${colspan - 2}" class="error-text">OFFLINE / NICHT ERREICHBAR</td>
        </tr>`;
    }

    let thsCurrent = formatTHs(minerDaten.hashRate);
    let eff = calcEfficiency(minerDaten.power, minerDaten.hashRate);
    let effNum = (minerDaten.hashRate > 0) ? minerDaten.power / (minerDaten.hashRate / 1000) : 0;
    let uptime = formatUptime(minerDaten.uptimeSeconds);
    let tempFan = `${minerDaten.temp.toFixed(1)} &deg;C / ${minerDaten.fanrpm} RPM`;

    let specificCols = isSolo
        ? `<td class="detail-spalte">${formatNumber(minerDaten.bestDiff)}</td><td class="detail-spalte"><strong>${minerDaten.foundBlocks || 0}</strong></td>`
        : `<td class="detail-spalte"><span style="color:#00e676;">${minerDaten.sharesAccepted || 0}</span> / <span class="error-text">${minerDaten.sharesRejected || 0}</span></td>`;

    return `<tr class="row-online">
        <td><strong>${minerInfo.name}</strong><br><small>${minerInfo.ip}</small></td>
        <td class="detail-spalte" style="color: #f7931a;"><strong>${minerInfo.coin || 'BTC'}</strong></td>
        <td class="highlight">${thsCurrent}</td>
        <td>${minerDaten.power} W</td>
        <td class="detail-spalte">${energieKwh != null ? energieKwh.toFixed(3) : "0.000"} kWh</td>
        <td>${ampelDot(effNum, 22, 35)}${eff}</td>
        <td>${ampelDot(minerDaten.temp, 65, 75)}${tempFan}</td>
        ${specificCols}
        <td class="detail-spalte">${uptime}</td>
    </tr>`;
}

// Die Haupt-Funktion für das Live-Update
async function fetchLiveDaten() {
    try {
        const response = await fetch('/live-daten');
        const daten = await response.json();

        // Übersichtsleiste aus allen Minern aktualisieren
        updateKpi(daten.solo.concat(daten.pool));

        // BEVOR wir das HTML bauen, schicken wir die Daten durch unsere Sortier-Maschine!
        const sortierteSolo = sortMiners(daten.solo);
        const sortiertePool = sortMiners(daten.pool);

        let soloHtml = "";
        if (sortierteSolo.length === 0) {
            soloHtml = '<tr><td colspan="10" style="text-align:center;">Keine Solo-Miner eingetragen.</td></tr>';
        } else {
            sortierteSolo.forEach(miner => {
                soloHtml += buildRowHTML(miner.info, miner.daten, true, miner.energie_kwh);
            });
        }
        document.getElementById('solo-table-body').innerHTML = soloHtml;

        let poolHtml = "";
        if (sortiertePool.length === 0) {
            poolHtml = '<tr><td colspan="9" style="text-align:center;">Keine Pool-Miner eingetragen.</td></tr>';
        } else {
            sortiertePool.forEach(miner => {
                poolHtml += buildRowHTML(miner.info, miner.daten, false, miner.energie_kwh);
            });
        }
        document.getElementById('pool-table-body').innerHTML = poolHtml;

    } catch (error) {
        console.error("Fehler beim Abrufen der Live-Daten:", error);
    }
}

// ============================================================
// VERLAUFS-GRAPH (Chart.js)
// ============================================================
let verlaufChart = null;
let aktuellerBereich = '24h';   // gewählter Zeitraum (1h/24h/woche/monat/jahr/gesamt)
const MINER_FARBEN = ['#f7931a', '#00e676', '#29b6f6', '#ab47bc', '#ef5350', '#ffee58'];
const METRIK_LABEL = { hashRate: 'Hashrate (GH/s)', power: 'Strom (W)', temp: 'Temperatur (°C)' };

// Erstellt das (anfangs leere) Diagramm
function initChart() {
    const canvas = document.getElementById('verlauf-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    verlaufChart = new Chart(canvas, {
        type: 'line',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false },
            scales: {
                x: {
                    type: 'linear',
                    ticks: {
                        color: '#aaa',
                        // kurze Zeiträume -> Uhrzeit (HH:MM), lange -> Datum (TT.MM)
                        callback: (v) => {
                            const d = new Date(v);
                            if (aktuellerBereich === '1h' || aktuellerBereich === '24h')
                                return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.07)' }
                },
                y: {
                    ticks: { color: '#aaa' },
                    grid: { color: 'rgba(255,255,255,0.07)' }
                }
            },
            plugins: { legend: { labels: { color: '#ddd' } } }
        }
    });
}

// Holt den Verlauf und aktualisiert das Diagramm für die gewählte Kennzahl
async function fetchVerlauf() {
    if (!verlaufChart) return;
    try {
        const response = await fetch(`/verlauf?bereich=${aktuellerBereich}`);
        const verlauf = await response.json();   // { ip: [ {t, hashRate, power, temp}, ... ] }
        const metrik = document.getElementById('metrik').value;

        // Pro Miner eine Linie (x = Zeit in ms, y = gewählte Kennzahl)
        verlaufChart.data.datasets = Object.keys(verlauf).map((ip, i) => {
            const farbe = MINER_FARBEN[i % MINER_FARBEN.length];
            return {
                label: ip,
                data: verlauf[ip].map(p => ({ x: p.t * 1000, y: p[metrik] })),
                borderColor: farbe,
                backgroundColor: farbe,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.25
            };
        });

        verlaufChart.options.scales.y.title = { display: true, text: METRIK_LABEL[metrik], color: '#aaa' };
        verlaufChart.update();
    } catch (error) {
        console.error("Fehler beim Abrufen des Verlaufs:", error);
    }
}

// Initialer Start
updateSortArrows();
fetchLiveDaten();
setInterval(fetchLiveDaten, 5000);

initChart();
fetchVerlauf();
setInterval(fetchVerlauf, 60000);   // Verlauf alle 60 s nachladen
const metrikSelect = document.getElementById('metrik');
if (metrikSelect) metrikSelect.addEventListener('change', fetchVerlauf);

// Zeitraum-Buttons für den Graphen
document.querySelectorAll('#chart-bereiche button').forEach(btn => {
    btn.addEventListener('click', () => {
        aktuellerBereich = btn.dataset.bereich;
        document.querySelectorAll('#chart-bereiche button').forEach(b => b.classList.remove('aktiv'));
        btn.classList.add('aktiv');
        fetchVerlauf();
    });
});

// Details ein-/ausklappen (blendet die Detail-Spalten ein/aus)
const detailsBtn = document.getElementById('details-toggle');
if (detailsBtn) {
    detailsBtn.addEventListener('click', () => {
        document.body.classList.toggle('details-an');
        detailsBtn.textContent = document.body.classList.contains('details-an')
            ? 'Details ausblenden' : 'Details anzeigen';
    });
}