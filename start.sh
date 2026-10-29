#!/usr/bin/env bash
set -euo pipefail

app_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$app_dir"

if ! command -v npm >/dev/null 2>&1; then
  if [ -s "${HOME}/.nvm/nvm.sh" ]; then
    source "${HOME}/.nvm/nvm.sh" --no-use
    nvm use --silent 22 >/dev/null
  fi
fi
if ! command -v npm >/dev/null 2>&1; then
  printf 'Не найден Node.js. Для запуска исходников нужен Node.js 22.12 или новее.\n' >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  npm ci
fi
if [ ! -f dist/index.html ]; then
  npm run build
fi

app_port="${PORT:-4173}"
app_url="http://127.0.0.1:${app_port}/"
app_html=''
if command -v curl >/dev/null 2>&1; then
  app_html="$(curl --silent --fail --max-time 1 "$app_url" || true)"
fi
if [[ "$app_html" == *'<title>Ход времени'* ]]; then
  printf '\nПриложение уже запущено: %s\n' "$app_url"
  if [ "${WATCH_NO_OPEN:-0}" != 1 ] && command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$app_url" >/dev/null 2>&1 || true
  fi
  exit 0
fi
printf '\nХод времени — http://127.0.0.1:%s\nДля остановки нажмите Ctrl+C.\n\n' "$app_port"
if [ "${WATCH_NO_OPEN:-0}" != 1 ] && command -v xdg-open >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
  (
    for attempt in {1..60}; do
      if curl --silent --fail "$app_url" >/dev/null 2>&1; then
        xdg-open "$app_url" >/dev/null 2>&1 || true
        break
      fi
      sleep 0.2
    done
  ) &
fi
exec npm run preview -- --port "$app_port" --strictPort
