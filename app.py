from flask import Flask, render_template, jsonify
from miner_funktionen import get_miner_data
from nachtwaechter import starte_nachtwaechter
import energie
import threading
import json
import os

app = Flask(__name__)

# ==========================================
# KONFIGURATION LADEN
# ==========================================
SOLO_MINERS = []
POOL_MINERS = []

if os.path.exists('config.json'):
    with open('config.json', 'r', encoding='utf-8') as f:
        config = json.load(f)
        SOLO_MINERS = config.get("SOLO_MINERS", [])
        POOL_MINERS = config.get("POOL_MINERS", [])
else:
    print("WARNUNG: config.json nicht gefunden! Bitte erstelle eine aus der config.example.json.")

# ==========================================
# FLASK WEB-ROUTEN
# ==========================================
@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/live-daten')
def live_daten():
    solo_daten = []
    for miner in SOLO_MINERS:
        daten = get_miner_data(miner['ip'])
        solo_daten.append({
            "info": miner,
            "daten": daten,
            "energie_kwh": energie.hole_verbrauch_kwh(miner['ip']),
        })

    pool_daten = []
    for miner in POOL_MINERS:
        daten = get_miner_data(miner['ip'])
        pool_daten.append({
            "info": miner,
            "daten": daten,
            "energie_kwh": energie.hole_verbrauch_kwh(miner['ip']),
        })

    return jsonify({"solo": solo_daten, "pool": pool_daten})

if __name__ == '__main__':
    waechter_thread = threading.Thread(target=starte_nachtwaechter, args=(SOLO_MINERS, POOL_MINERS), daemon=True)
    waechter_thread.start()

    app.run(host='0.0.0.0', port=5000)