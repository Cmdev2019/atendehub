#!/bin/sh
# B-64: roda no boot do container, antes do envsubst dos templates
# (20-envsubst-on-templates.sh). Sem MEDIA_STORAGE_HOST o upstream da mídia
# sai com o texto "${MEDIA_STORAGE_HOST}" literal — o nginx aceita (o
# `resolve` adia o DNS) e só a mídia quebra, com 502, quando alguém abre uma
# imagem. Aqui o container recusa subir.
set -eu

case "${MEDIA_STORAGE_HOST:-}" in
  "" | *[!A-Za-z0-9.-]*)
    echo "$0: MEDIA_STORAGE_HOST ausente ou inválido — deve ser o host S3 do R2, sem esquema nem porta (ex.: <conta>.r2.cloudflarestorage.com)" >&2
    exit 1
    ;;
esac
