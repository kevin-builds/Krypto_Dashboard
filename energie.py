"""Energie-Tracking: summiert den Stromverbrauch der Miner über die Zeit auf.

Die Miner-API liefert nur die AKTUELLE Leistung (Watt). Um den
Gesamtverbrauch (kWh) zu kennen, summieren wir Leistung × Zeit auf und
speichern das Ergebnis persistent in ``energie.json`` (überlebt Neustarts).

Der Nachtwächter-Thread ruft :func:`addiere_verbrauch` einmal pro Zyklus auf,
die Flask-Route liest mit :func:`hole_verbrauch_kwh`. Beide laufen im selben
Prozess, daher genügt ein gemeinsames, per Lock geschütztes Dict.
"""

import json
import os
import threading

# Speicherort relativ zum Arbeitsverzeichnis (= /home/pi/Krypto_Dashboard).
ENERGIE_DATEI = "energie.json"

_lock = threading.Lock()


def _lade_roh() -> dict:
    """Lädt den gespeicherten Verbrauch (Wattstunden je Miner-IP)."""
    if os.path.exists(ENERGIE_DATEI):
        try:
            with open(ENERGIE_DATEI, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


# In-Memory-Zähler {miner_ip: wattstunden}, beim Start aus der Datei geladen.
_verbrauch_wh = _lade_roh()


def addiere_verbrauch(miner_ip: str, leistung_w: float, intervall_s: float) -> None:
    """Addiert den in ``intervall_s`` Sekunden bei ``leistung_w`` Watt
    verbrauchten Strom (in Wattstunden) zum Gesamtzähler des Miners.

    Ungültige/fehlende Werte (Miner offline, keine Leistung) werden ignoriert.
    """
    if not leistung_w or leistung_w <= 0 or intervall_s <= 0:
        return
    zuwachs_wh = leistung_w * (intervall_s / 3600.0)
    with _lock:
        _verbrauch_wh[miner_ip] = _verbrauch_wh.get(miner_ip, 0.0) + zuwachs_wh
        try:
            with open(ENERGIE_DATEI, "w", encoding="utf-8") as f:
                json.dump(_verbrauch_wh, f)
        except OSError:
            pass  # Schreibfehler darf den Nachtwächter nicht abstürzen lassen


def hole_verbrauch_kwh(miner_ip: str) -> float:
    """Gibt den bisherigen Gesamtverbrauch eines Miners in kWh zurück (gerundet)."""
    with _lock:
        return round(_verbrauch_wh.get(miner_ip, 0.0) / 1000.0, 3)
