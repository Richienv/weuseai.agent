// Minimal USTAR tar.gz writer — Persona Genesis bundle packager.
//
// The curated agent-pack tarballs are built by CI tooling on a dev machine;
// Persona Genesis must build one INSIDE an Edge Function, where there is no
// tar binary. USTAR is a simple format (512-byte header blocks + content
// padded to 512), and gzip is available in both Deno and Node ≥18 via
// CompressionStream — so this is a small pure implementation rather than a
// dependency.
//
// Scope: regular files only (that is all a bundle contains), paths ≤100
// chars (bundle paths are short), UTF-8 content. Matches what
// `tar -xzf` on the customer VPS (GNU tar) extracts.

export type TarEntry = {
  /** Relative path inside the archive, e.g. "manifest.json" or
   *  "skills/morning-update/SKILL.md". */
  path: string
  content: string
}

const BLOCK = 512

function octal(value: number, width: number): Uint8Array {
  // Width includes the trailing NUL. Zero-padded octal + NUL.
  const s = value.toString(8).padStart(width - 1, '0')
  const out = new Uint8Array(width)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  out[width - 1] = 0
  return out
}

function writeStr(target: Uint8Array, offset: number, s: string | Uint8Array): void {
  const bytes = typeof s === 'string' ? new TextEncoder().encode(s) : s
  target.set(bytes, offset)
}

function header(path: string, size: number): Uint8Array {
  if (new TextEncoder().encode(path).length > 100) {
    throw new Error(`tar path too long (>100 bytes): ${path}`)
  }
  const h = new Uint8Array(BLOCK)
  writeStr(h, 0, path)                       // name
  writeStr(h, 100, octal(0o644, 8))          // mode
  writeStr(h, 108, octal(0, 8))              // uid
  writeStr(h, 116, octal(0, 8))              // gid
  writeStr(h, 124, octal(size, 12))          // size
  writeStr(h, 136, octal(Math.floor(Date.now() / 1000), 12)) // mtime
  // checksum field spaces during computation
  for (let i = 148; i < 156; i++) h[i] = 0x20
  h[156] = 0x30                              // typeflag '0' regular file
  writeStr(h, 257, 'ustar')                  // magic
  h[263] = 0x30; h[264] = 0x30               // version "00"
  writeStr(h, 265, 'weuseai')                // uname
  writeStr(h, 297, 'weuseai')                // gname
  // checksum
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += h[i]
  const chk = sum.toString(8).padStart(6, '0')
  writeStr(h, 148, chk)
  h[154] = 0                                 // NUL
  h[155] = 0x20                              // space
  return h
}

/** Build an (uncompressed) USTAR archive from entries. */
export function buildTar(entries: TarEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  for (const e of entries) {
    const body = enc.encode(e.content)
    parts.push(header(e.path, body.length))
    parts.push(body)
    const pad = (BLOCK - (body.length % BLOCK)) % BLOCK
    if (pad > 0) parts.push(new Uint8Array(pad))
  }
  // End-of-archive: two zero blocks.
  parts.push(new Uint8Array(BLOCK * 2))
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** Exact-range ArrayBuffer copy — keeps both tsconfig lib sets happy
 *  (no `BlobPart` name; no SharedArrayBuffer in the Blob signature). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** gzip bytes via the platform CompressionStream (Deno + Node ≥18). */
export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(cs)
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

/** Convenience: entries → .tar.gz bytes. */
export async function buildTarGz(entries: TarEntry[]): Promise<Uint8Array> {
  return await gzipBytes(buildTar(entries))
}

// ─── test-side reader (also used by the chain harness to verify) ─────────

export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip')
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(ds)
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

/** Parse a USTAR archive produced by buildTar (regular files only). */
export function parseTar(bytes: Uint8Array): TarEntry[] {
  const dec = new TextDecoder()
  const entries: TarEntry[] = []
  let off = 0
  while (off + BLOCK <= bytes.length) {
    const block = bytes.subarray(off, off + BLOCK)
    if (block.every((b) => b === 0)) break // end-of-archive
    const name = dec.decode(block.subarray(0, 100)).replace(/\0.*$/, '')
    const sizeOctal = dec.decode(block.subarray(124, 136)).replace(/\0.*$/, '').trim()
    const size = parseInt(sizeOctal, 8)
    if (!Number.isFinite(size)) throw new Error(`bad tar size for ${name}`)
    const body = bytes.subarray(off + BLOCK, off + BLOCK + size)
    entries.push({ path: name, content: dec.decode(body) })
    off += BLOCK + size + ((BLOCK - (size % BLOCK)) % BLOCK)
  }
  return entries
}
