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
    // Dann beim aktiven Feld den Pfeil setzen
    const activeArrow = document.getElementById(`sort-${currentSortKey}`);
    if (activeArrow) {
        activeArrow.innerHTML = sortAscending ? '▲' : '▼';
    }
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

// Baut den HTML-Code für EINE Tabellenzeile
function buildRowHTML(minerInfo, minerDaten, isSolo, energieKwh) {
    if (!minerDaten) {
        let colspan = isSolo ? 10 : 9;
        return `<tr class="row-offline">
            <td><strong>${minerInfo.name}</strong><br><small>${minerInfo.ip}</small></td>
            <td><strong>${minerInfo.coin || 'Unbekannt'}</strong></td>
            <td colspan="${colspan - 2}" class="error-text">OFFLINE / NICHT ERREICHBAR</td>
        </tr>`;
    }

    let thsCurrent = formatTHs(minerDaten.hashRate);
    let eff = calcEfficiency(minerDaten.power, minerDaten.hashRate);
    let uptime = formatUptime(minerDaten.uptimeSeconds);
    let tempFan = `${minerDaten.temp.toFixed(1)} &deg;C / ${minerDaten.fanrpm} RPM`;

    let specificCols = isSolo
        ? `<td>${formatNumber(minerDaten.bestDiff)}</td><td><strong>${minerDaten.foundBlocks || 0}</strong></td>`
        : `<td><span style="color:#00e676;">${minerDaten.sharesAccepted || 0}</span> / <span class="error-text">${minerDaten.sharesRejected || 0}</span></td>`;

    return `<tr class="row-online">
        <td><strong>${minerInfo.name}</strong><br><small>${minerInfo.ip}</small></td>
        <td style="color: #f7931a;"><strong>${minerInfo.coin || 'BTC'}</strong></td>
        <td class="highlight">${thsCurrent}</td>
        <td>${minerDaten.power} W</td>
        <td>${energieKwh != null ? energieKwh.toFixed(3) : "0.000"} kWh</td>
        <td>${eff}</td>
        <td>${tempFan}</td>
        ${specificCols}
        <td>${uptime}</td>
    </tr>`;
}

// Die Haupt-Funktion für das Live-Update
async function fetchLiveDaten() {
    try {
        const response = await fetch('/live-daten');
        const daten = await response.json();

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

// Initialer Start
updateSortArrows();
fetchLiveDaten();
setInterval(fetchLiveDaten, 5000);