const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  '*': 'nwnnwnwnn',
}

export function code39Pattern(serial: string): string {
  const payload = `*${serial}*`
  const bars: string[] = []
  for (const char of payload) {
    const pattern = CODE39[char]
    if (!pattern) throw new Error('unsupported_barcode_char')
    bars.push(pattern)
  }
  return bars.join('s')
}

export function code39Svg(serial: string): string {
  const pattern = code39Pattern(serial)
  const unit = 2
  let x = unit * 4
  let width = x
  const rects: string[] = []
  for (const cell of pattern) {
    const w = cell === 'w' ? unit * 3 : unit
    if (cell !== 's') {
      rects.push(`<rect x="${x}" y="0" width="${w}" height="36" fill="#111111"/>`)
    }
    x += w
    width = x
  }
  width += unit * 4
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 36" width="100%" height="36" role="img" aria-label="${serial}">${rects.join('')}</svg>`
}
