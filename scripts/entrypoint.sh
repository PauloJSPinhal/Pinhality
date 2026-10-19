#!/bin/sh
# Paulo: o contentor de produção passou a correr como o utilizador "node" (sem privilégios) em vez de root.
# Se alguém conseguisse explorar uma falha na app, ficava limitado a esse utilizador.
# Os volumes criados pelas versões antigas pertencem ao root; este script corrige o dono uma vez
# (só se for preciso) e depois arranca o servidor já como "node" através do su-exec.
set -e

if [ "$(id -u)" = "0" ]; then
  for dir in /data /dados_privados; do
    mkdir -p "$dir"
    if [ "$(stat -c %u "$dir")" != "1000" ] || [ -n "$(find "$dir" -mindepth 1 ! -user node -print -quit 2>/dev/null)" ]; then
      echo "A corrigir o dono de $dir para o utilizador node..."
      chown -R node:node "$dir"
    fi
  done
  # Ficheiros privados (rclone.conf, segredo da sessão) só legíveis pelo utilizador node
  if [ -d /data/private ]; then
    chmod 700 /data/private
    find /data/private -type f -exec chmod 600 {} +
  fi
  exec su-exec node "$@"
fi

exec "$@"
