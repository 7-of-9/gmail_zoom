#!/usr/bin/env bash
# Rebuild icons/icon-{16,32,48,128}.png from icons/icon.svg with headless Chrome.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

svg64="$(base64 < icon.svg | tr -d '\n')"
cat > "$tmp/render.html" <<EOF
<!doctype html><pre id="out"></pre><script>
const img = new Image();
img.onload = () => {
  document.getElementById('out').textContent = [16, 32, 48, 128].map((s) => {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    c.getContext('2d').drawImage(img, 0, 0, s, s);
    return s + ' ' + c.toDataURL('image/png').split(',')[1];
  }).join('\n');
};
img.src = 'data:image/svg+xml;base64,$svg64';
</script>
EOF

"$CHROME" --headless=new --user-data-dir="$tmp/profile" --virtual-time-budget=2000 \
  --dump-dom "file://$tmp/render.html" 2>/dev/null \
  | sed -n 's/.*<pre id="out">//; s/<\/pre>.*//; /^[0-9][0-9]* /p' \
  | while read -r size b64; do printf '%s' "$b64" | base64 --decode > "icon-$size.png"; done

ls -l icon-*.png
