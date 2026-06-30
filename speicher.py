"""Atomares (race-/crash-sicheres) Schreiben von JSON-Dateien.

Schreibt erst in eine Temp-Datei im selben Verzeichnis und benennt sie dann
per os.replace um. Ein Rename auf demselben Dateisystem ist atomar: Ein
gleichzeitig lesender Prozess sieht nie eine halb geschriebene Datei.
"""

import json
import os
import tempfile


def atomar_json_schreiben(pfad, daten):
    """Schreibt ``daten`` atomar als JSON nach ``pfad``."""
    verzeichnis = os.path.dirname(os.path.abspath(pfad)) or "."
    fd, tmp = tempfile.mkstemp(dir=verzeichnis, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(daten, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, pfad)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
