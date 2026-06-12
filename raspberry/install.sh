#!/bin/bash
# ── Lyrics Status — Script d'installation Raspberry Pi ───────────────────────
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RASP_DIR="$REPO_DIR/raspberry"
VENV_DIR="$RASP_DIR/venv"
SERVICE_NAME="lyrics-status"
CURRENT_USER="$(whoami)"

echo "=== Lyrics Status — Installation ==="
echo "Utilisateur : $CURRENT_USER"
echo "Dossier     : $RASP_DIR"
echo ""

# ── 1. Mise à jour & Python ──────────────────────────────────────────────────
echo "[1/5] Vérification de Python 3..."
sudo apt-get update -qq
sudo apt-get install -y python3 python3-venv python3-full

# ── 2. Environnement virtuel + dépendances ───────────────────────────────────
echo "[2/5] Création de l'environnement virtuel et installation des dépendances..."
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet -r "$RASP_DIR/requirements.txt"
echo "  ✓ Environnement virtuel créé dans $VENV_DIR"

# ── 3. Fichier de config ─────────────────────────────────────────────────────
echo "[3/5] Vérification du fichier de configuration..."
if [ ! -f "$RASP_DIR/config.json" ]; then
    cp "$RASP_DIR/config.example.json" "$RASP_DIR/config.json"
    echo "  ✓ config.json créé depuis le template."
    echo "  ⚠ Remplis $RASP_DIR/config.json avant de continuer !"
else
    echo "  ✓ config.json déjà présent."
fi

# ── 4. Service systemd ───────────────────────────────────────────────────────
echo "[4/5] Configuration du service systemd..."
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
sed "s|__USER__|${CURRENT_USER}|g; s|/home/__USER__/lyrics-status|${REPO_DIR}|g; s|/usr/bin/python3|${VENV_DIR}/bin/python3|g" \
    "$RASP_DIR/lyrics-status.service" | sudo tee "$SERVICE_FILE" > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
echo "  ✓ Service installé et activé au démarrage."

# ── 5. Authentification Spotify ──────────────────────────────────────────────
echo "[5/5] Authentification Spotify..."
if [ ! -f "$RASP_DIR/spotify_token.json" ]; then
    echo "  Lance maintenant : $VENV_DIR/bin/python3 $RASP_DIR/auth.py"
else
    echo "  ✓ spotify_token.json déjà présent."
fi

echo ""
echo "=== Installation terminée ==="
echo ""
echo "Prochaines étapes :"
echo "  1. Remplis config.json avec tes tokens (si pas encore fait)"
echo "  2. Lance : $VENV_DIR/bin/python3 $RASP_DIR/auth.py"
echo "  3. Démarre le service : sudo systemctl start $SERVICE_NAME"
echo "  4. Vérifie les logs  : sudo journalctl -u $SERVICE_NAME -f"
