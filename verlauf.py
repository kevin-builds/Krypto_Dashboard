"""Verlaufs-Tracking: speichert Messpunkte der Miner über die Zeit.

Damit aus dem reinen Live-Dashboard echtes Monitoring wird, sammeln wir
regelmäßig Datenpunkte (Hashrate, Leistung, Temperatur) je Miner.

Zweistufige Speicherung (schont die SD-Karte und deckt alle Zeiträume ab):
- **fein**: alle 5 Min, letzte 48 h  -> für die Zeiträume 1H / 24h
- **grob**: alle 1 h,   letzte ~1 Jahr -> für Woche / Monat / Jahr / Gesamt

Beide Reihen sind rollende Fenster fester Größe und werden atomar (siehe
:mod:`speicher`) nach ``verlauf.json`` geschrieben.
"""

import json
import os
import time
import threading

import speicher

VERLAUF_DATEI = "verlauf.json"

# Feine Auflösung: alle 5 Min, max. 576 Punkte = 48 h.
FEIN_ABSTAND_S = 300
FEIN_MAX = 576
# Grobe Auflösung: alle 1 h, max. 8784 Punkte = 366 Tage.
GROB_ABSTAND_S = 3600
GROB_MAX = 8784

_lock = threading.Lock()


def _lade():
    """Lädt den Verlauf im Format {ip: {"fein": [...], "grob": [...]}}."""
    if not os.path.exists(VERLAUF_DATEI):
        return {}
    try:
        with open(VERLAUF_DATEI, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}

    if not isinstance(data, dict):
        return {}

    bereinigt = {}
    for ip, wert in data.items():
        if isinstance(wert, dict):
            bereinigt[ip] = {"fein": wert.get("fein", []), "grob": wert.get("grob", [])}
        elif isinstance(wert, list):
            # altes Format (eine Liste) -> als feine Reihe übernehmen
            bereinigt[ip] = {"fein": wert, "grob": []}
    return bereinigt


_verlauf = _lade()
_letzter = {}  # miner_ip -> {"fein": ts, "grob": ts}


def _punkt(daten, jetzt):
    return {
        "t": int(jetzt),  # Unix-Zeitstempel (Sekunden)
        "hashRate": daten.get("hashRate"),
        "power": daten.get("power"),
        "temp": daten.get("temp"),
    }


def _anhaengen(liste, punkt, maximum):
    liste.append(punkt)
    if len(liste) > maximum:
        del liste[: len(liste) - maximum]


def erfasse_punkt(miner_ip, daten):
    """Speichert einen Messpunkt je Reihe – gedrosselt auf deren Zeittakt.

    Offline-Miner (keine/fehlerhafte Daten) werden übersprungen.
    """
    if not daten or "error" in daten:
        return

    jetzt = time.time()
    with _lock:
        eintrag = _verlauf.setdefault(miner_ip, {"fein": [], "grob": []})
        letzter = _letzter.setdefault(miner_ip, {"fein": 0, "grob": 0})
        geaendert = False

        if jetzt - letzter["fein"] >= FEIN_ABSTAND_S:
            letzter["fein"] = jetzt
            _anhaengen(eintrag["fein"], _punkt(daten, jetzt), FEIN_MAX)
            geaendert = True

        if jetzt - letzter["grob"] >= GROB_ABSTAND_S:
            letzter["grob"] = jetzt
            _anhaengen(eintrag["grob"], _punkt(daten, jetzt), GROB_MAX)
            geaendert = True

        if geaendert:
            try:
                speicher.atomar_json_schreiben(VERLAUF_DATEI, _verlauf)
            except OSError:
                pass  # Schreibfehler darf den Nachtwächter nicht abstürzen lassen


# Zeitraum -> (Sekunden zurück oder None=alles, welche Auflösung)
_BEREICHE = {
    "1h":     (3600,     "fein"),
    "24h":    (86400,    "fein"),
    "woche":  (604800,   "grob"),
    "monat":  (2592000,  "grob"),
    "jahr":   (31536000, "grob"),
    "gesamt": (None,     "grob"),
}


def hole_verlauf(bereich="24h"):
    """Gibt die Messpunkte je Miner für den gewählten Zeitraum zurück.

    Wählt automatisch die passende Auflösung (fein/grob) und filtert auf das
    Zeitfenster.
    """
    sekunden, aufloesung = _BEREICHE.get(bereich, _BEREICHE["24h"])
    grenze = None if sekunden is None else time.time() - sekunden

    ergebnis = {}
    with _lock:
        for ip, eintrag in _verlauf.items():
            punkte = eintrag.get(aufloesung, [])
            if grenze is not None:
                punkte = [p for p in punkte if p.get("t", 0) >= grenze]
            ergebnis[ip] = list(punkte)
    return ergebnis
