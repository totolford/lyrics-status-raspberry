#!/bin/bash
# ── Lyrics Status — Script d'installation Raspberry Pi ───────────────────────
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RASP_DIR="$REPO_DIR/raspberry"
SERVICE_NAME="lyrics-status"
CURRENT_USER="$(whoami)"

echo "=== Lyrics Status — Installation ==="
echo "Utilisateur : $CURRENT_USER"
echo "Dossier     : $RASP_DIR"
echo ""

# ── 1. Mise à jour & Python ──────────────────────────────────────────────────
echo "[1/5] Vérification de Python 3 et pip..."
sudo apt-get update -qq
sudo apt-get install -y python3 python3-pip

# ── 2. Dépendances Python ────────────────────────────────────────────────────
echo "[2/5] Installation des dépendances Python..."
pip3 install --user -r "$RASP_DIR/requirements.txt"

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
sed "s|__USER__|${CURRENT_USER}|g; s|/home/__USER__/lyrics-status|${REPO_DIR}|g" \
    "$RASP_DIR/lyrics-status.service" | sudo tee "$SERVICE_FILE" > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
echo "  ✓ Service installé et activé au démarrage."

# ── 5. Authentification Spotify ──────────────────────────────────────────────
echo "[5/5] Authentification Spotify..."
if [ ! -f "$RASP_DIR/spotify_token.json" ]; then
    echo "  Lance maintenant : python3 $RASP_DIR/auth.py"
    echo "  (nécessite un navigateur — fais-le sur ton PC si le Pi n'en a pas)"
else
    echo "  ✓ spotify_token.json déjà présent."
fi

echo ""
echo "=== Installation terminée ==="
echo ""
echo "Prochaines étapes :"
echo "  1. Remplis config.json avec tes tokens"
echo "  2. Lance : python3 $RASP_DIR/auth.py"
echo "  3. Démarre le service : sudo systemctl start $SERVICE_NAME"
echo "  4. Vérifie les logs  : sudo journalctl -u $SERVICE_NAME -f"
