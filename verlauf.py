"""Verlaufs-Tracking: speichert Messpunkte der Miner über die Zeit.

Damit aus dem reinen Live-Dashboard echtes Monitoring wird, sammeln wir
regelmäßig Datenpunkte (Hashrate, Leistung, Temperatur) je Miner und legen
sie persistent in ``verlauf.json`` ab. Das Frontend zeichnet daraus Graphen.

Schonend für die SD-Karte:
- höchstens alle ``MIN_ABSTAND_S`` Sekunden ein Punkt (nicht jede Minute),
- pro Miner nur die letzten ``MAX_PUNKTE`` Punkte (rollendes Fenster),
- atomares Schreiben über :mod:`speicher`.
"""

import json
import os
import time
import threading

import speicher

VERLAUF_DATEI = "verlauf.json"

# Höchstens alle 5 Minuten ein Punkt -> 288 Punkte/Tag.
MIN_ABSTAND_S = 300
# Pro Miner max. 576 Punkte = ~48 Stunden Historie.
MAX_PUNKTE = 576

_lock = threading.Lock()


def _lade():
    """Lädt den gespeicherten Verlauf ({miner_ip: [punkt, ...]})."""
    if os.path.exists(VERLAUF_DATEI):
        try:
            with open(VERLAUF_DATEI, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


_verlauf = _lade()
_letzter_punkt = {}  # miner_ip -> Zeitstempel des letzten gespeicherten Punkts


def erfasse_punkt(miner_ip, daten):
    """Speichert einen Messpunkt für den Miner – aber höchstens alle 5 Minuten.

    Offline-Miner (keine/fehlerhafte Daten) werden übersprungen.
    """
    if not daten or "error" in daten:
        return

    jetzt = time.time()
    with _lock:
        # Throttling: nur, wenn der letzte Punkt lange genug her ist.
        if jetzt - _letzter_punkt.get(miner_ip, 0) < MIN_ABSTAND_S:
            return
        _letzter_punkt[miner_ip] = jetzt

        punkt = {
            "t": int(jetzt),                  # Unix-Zeitstempel (Sekunden)
            "hashRate": daten.get("hashRate"),
            "power": daten.get("power"),
            "temp": daten.get("temp"),
        }
        liste = _verlauf.setdefault(miner_ip, [])
        liste.append(punkt)

        # Rollendes Fenster: nur die neuesten MAX_PUNKTE behalten.
        if len(liste) > MAX_PUNKTE:
            del liste[: len(liste) - MAX_PUNKTE]

        try:
            speicher.atomar_json_schreiben(VERLAUF_DATEI, _verlauf)
        except OSError:
            pass  # Schreibfehler darf den Nachtwächter nicht abstürzen lassen


def hole_verlauf():
    """Gibt eine Kopie des gesamten Verlaufs zurück (für die Flask-Route)."""
    with _lock:
        return {ip: list(punkte) for ip, punkte in _verlauf.items()}
