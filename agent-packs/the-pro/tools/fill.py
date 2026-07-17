#!/usr/bin/env python3
"""fill.py — pengisi template website instan The Pro (weuseai.agent).

Mengisi placeholder {{mustache}} di template HTML self-contained dengan
jawaban customer, secara deterministik. Python stdlib saja.

⚡ spike-gated: serving via Caddy di VPS customer belum terverifikasi.
File hasil tetap dibuat sekarang; skill website-instan menandai serving
sebagai langkah yang menunggu verifikasi.

Keamanan nilai:
  - default        → HTML-escape (&, <, >, ", '). Baris baru dipertahankan;
                     template memakai white-space: pre-line untuk multi-baris.
  - {{key|links}}  → tiap baris "Label | https://..." jadi tombol <a>.
                     Hanya http/https yang diterima.
  - {{key|tabel}}  → tiap baris "Kolom A | Kolom B | Kolom C" jadi baris tabel
                     (2 atau 3 kolom).
  - {{key|wa}}     → nomor WhatsApp jadi digit saja (0812... → 62812...)
                     untuk link wa.me.

Perintah:
  fill.py daftar --template file.html
      → JSON daftar placeholder di template.
  fill.py isi --template file.html --jawaban jawaban.json --out hasil.html
      → tulis hasil; error kalau ada placeholder belum terisi.
"""

import argparse
import html
import json
import os
import re
import sys

PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-z][a-z0-9_]*)\s*(?:\|\s*(links|tabel|wa)\s*)?\}\}")


def die(msg: str) -> None:
    print(f"fill.py: {msg}", file=sys.stderr)
    sys.exit(1)


def esc(value: str) -> str:
    return html.escape(str(value), quote=True)


def render_links(value: str) -> str:
    out = []
    for raw in str(value).splitlines():
        line = raw.strip()
        if not line:
            continue
        if "|" not in line:
            die(f"baris link tidak valid (format 'Label | https://...'): {line!r}")
        label, url = (part.strip() for part in line.split("|", 1))
        if not re.match(r"^https?://", url):
            die(f"URL harus http/https: {url!r}")
        out.append(f'<a class="tautan" href="{esc(url)}">{esc(label)}</a>')
    return "\n".join(out)


def render_tabel(value: str) -> str:
    out = []
    for raw in str(value).splitlines():
        line = raw.strip()
        if not line:
            continue
        cells = [esc(c.strip()) for c in line.split("|")]
        if len(cells) not in (2, 3):
            die(f"baris tabel butuh 2-3 kolom dipisah '|': {line!r}")
        out.append("<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>")
    return "\n".join(out)


def render_wa(value: str) -> str:
    digits = re.sub(r"\D", "", str(value))
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    if not re.fullmatch(r"\d{9,15}", digits):
        die(f"nomor WhatsApp tidak valid: {value!r}")
    return digits


FILTERS = {None: esc, "links": render_links, "tabel": render_tabel, "wa": render_wa}


def read_template(path: str) -> str:
    if not os.path.exists(path):
        die(f"template tidak ditemukan: {path}")
    with open(path, encoding="utf-8") as f:
        return f.read()


def cmd_daftar(args) -> dict:
    tpl = read_template(args.template)
    seen = []
    for m in PLACEHOLDER_RE.finditer(tpl):
        key = m.group(1)
        if key not in seen:
            seen.append(key)
    return {"ok": True, "template": args.template, "placeholder": seen}


def cmd_isi(args) -> dict:
    tpl = read_template(args.template)
    if not os.path.exists(args.jawaban):
        die(f"file jawaban tidak ditemukan: {args.jawaban}")
    with open(args.jawaban, encoding="utf-8") as f:
        try:
            answers = json.load(f)
        except json.JSONDecodeError as e:
            die(f"jawaban bukan JSON valid: {e}")
    if not isinstance(answers, dict):
        die("jawaban harus objek JSON {placeholder: nilai}")

    needed = {m.group(1) for m in PLACEHOLDER_RE.finditer(tpl)}
    missing = sorted(needed - set(answers))
    if missing:
        die(f"jawaban belum lengkap, kurang: {', '.join(missing)}")

    def replace(m: re.Match) -> str:
        return FILTERS[m.group(2)](answers[m.group(1)])

    result = PLACEHOLDER_RE.sub(replace, tpl)
    leftover = PLACEHOLDER_RE.findall(result)
    if leftover:
        die(f"masih ada placeholder tersisa setelah isi: {leftover}")

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(result)
    return {
        "ok": True,
        "aksi": "isi",
        "template": args.template,
        "out": args.out,
        "bytes": len(result.encode("utf-8")),
        "terpakai": sorted(needed),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Pengisi template website (deterministik).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("daftar", help="daftar placeholder di template")
    p.add_argument("--template", required=True)
    p.set_defaults(fn=cmd_daftar)

    p = sub.add_parser("isi", help="isi template dengan jawaban JSON")
    p.add_argument("--template", required=True)
    p.add_argument("--jawaban", required=True)
    p.add_argument("--out", required=True)
    p.set_defaults(fn=cmd_isi)

    args = parser.parse_args()
    print(json.dumps(args.fn(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
