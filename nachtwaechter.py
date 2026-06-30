import time
import requests
import json
import os
from miner_funktionen import get_miner_data
import energie
import verlauf

def load_webhook_url():
    if os.path.exists('config.json'):
        with open('config.json', 'r', encoding='utf-8') as f:
            config = json.load(f)
            return config.get("DISCORD_WEBHOOK_URL", "")
    return ""

DISCORD_WEBHOOK_URL = load_webhook_url()
miner_gedaechtnis = {}


def sende_discord_alarm(nachricht):
    # Prüfe: Ist die URL leer ODER sieht sie NICHT wie ein echter Webhook aus?
    # (Ein echter Discord-Webhook enthält "discord.com/api/webhooks".)
    if not DISCORD_WEBHOOK_URL or "discord.com/api/webhooks" not in DISCORD_WEBHOOK_URL:
        print("Abbruch: Kein gültiger Discord-Webhook konfiguriert.")
        return

    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"content": nachricht})
    except Exception as e:
        print(f"Konnte nicht an Discord senden: {e}")


def check_alarme(miner_ip, daten, ist_solo):
    if miner_ip not in miner_gedaechtnis:
        miner_gedaechtnis[miner_ip] = {
            "offline_seit": None,
            "offline_alarm_gesendet": False,
            "bloecke_bisher": 0
        }

    status = miner_gedaechtnis[miner_ip]
    ist_offline = False
    if not daten or "error" in daten:
        ist_offline = True

    # --- ALARM 2: Miner ist offline ---
    if ist_offline:
        if status["offline_seit"] is None:
            status["offline_seit"] = time.time()
        else:
            dauer_offline = time.time() - status["offline_seit"]
            if dauer_offline >= 600 and not status["offline_alarm_gesendet"]:
                sende_discord_alarm(f"⚠️ **ALARM:** Miner `{miner_ip}` ist seit 10 Minuten offline!")
                status["offline_alarm_gesendet"] = True
    else:
        if status["offline_alarm_gesendet"]:
            sende_discord_alarm(f"✅ **ENTWARNUNG:** Miner `{miner_ip}` ist wieder erreichbar!")

        status["offline_seit"] = None
        status["offline_alarm_gesendet"] = False

        # --- ALARM 1: Block gefunden! (NUR FÜR SOLO MINER) ---
        if ist_solo:
            aktuelle_bloecke = daten.get("blocks", 0)

            if status["bloecke_bisher"] == 0 and aktuelle_bloecke > 0:
                status["bloecke_bisher"] = aktuelle_bloecke
            elif aktuelle_bloecke > status["bloecke_bisher"]:
                sende_discord_alarm(f"🚨 **JACKPOT!** Solo-Miner `{miner_ip}` hat einen BLOCK gefunden! 🚨")
                status["bloecke_bisher"] = aktuelle_bloecke


def _erfasse_energie(miner_ip, daten, intervall_s):
    # Bei Online-Miner die aktuelle Leistung (Watt) über das vergangene
    # Intervall als verbrauchte Energie aufsummieren.
    if daten and "error" not in daten:
        energie.addiere_verbrauch(miner_ip, daten.get("power"), intervall_s)


def starte_nachtwaechter(solo_miners, pool_miners):
    print("Nachtwächter gestartet. Überwache Miner im Hintergrund...")
    # Echte vergangene Zeit zwischen den Zyklen messen (genauer als fix 60s).
    letzte_zeit = time.time()
    while True:
        jetzt = time.time()
        intervall_s = jetzt - letzte_zeit
        letzte_zeit = jetzt

        for miner in solo_miners:
            daten = get_miner_data(miner['ip'])
            check_alarme(miner['ip'], daten, ist_solo=True)
            _erfasse_energie(miner['ip'], daten, intervall_s)
            verlauf.erfasse_punkt(miner['ip'], daten)

        for miner in pool_miners:
            daten = get_miner_data(miner['ip'])
            check_alarme(miner['ip'], daten, ist_solo=False)
            _erfasse_energie(miner['ip'], daten, intervall_s)
            verlauf.erfasse_punkt(miner['ip'], daten)

        time.sleep(60)