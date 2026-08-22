export const RAINBOW_SENTINEL = '__materialpbx_rainbow__' as const
export type ColorValue = string | typeof RAINBOW_SENTINEL

const clamp = (value: number, min = 0, max = 255) => Math.min(max, Math.max(min, value))

export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{3,8}$/i.test(value) || ![3, 4, 6, 8].includes(value.length)) return null
  const expanded = value.length <= 4 ? [...value].map((part) => part + part).join('') : value
  return `#${expanded.toUpperCase()}`
}

export function hexChannels(input: string) {
  const normalized = normalizeHex(input) ?? '#6750A4FF'
  const value = normalized.slice(1)
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1,
  }
}

export function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn)
  let h = 0; let s = 0; const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    if (max === gn) h = ((bn - rn) / d + 2) / 6
    if (max === bn) h = ((rn - gn) / d + 4) / 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn); const d = max - min
  let h = 0
  if (d) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / d + 2)
    else h = 60 * ((rn - gn) / d + 4)
  }
  if (h < 0) h += 360
  return { h: Math.round(h), s: Math.round((max ? d / max : 0) * 100), v: Math.round(max * 100) }
}

export function rgbToCmyk(r: number, g: number, b: number) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255; const k = 1 - Math.max(rn, gn, bn)
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 }
  return {
    c: Math.round(((1 - rn - k) / (1 - k)) * 100),
    m: Math.round(((1 - gn - k) / (1 - k)) * 100),
    y: Math.round(((1 - bn - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  }
}

function rgbToXyz(r: number, g: number, b: number) {
  const linear = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const rn = linear(r); const gn = linear(g); const bn = linear(b)
  return {
    x: rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375,
    y: rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175,
    z: rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041,
  }
}

function rgbToLab(r: number, g: number, b: number) {
  const xyz = rgbToXyz(r, g, b)
  const f = (value: number) => value > 216 / 24389 ? Math.cbrt(value) : (841 / 108) * value + 4 / 29
  const fx = f(xyz.x / 0.95047); const fy = f(xyz.y); const fz = f(xyz.z / 1.08883)
  const l = 116 * fy - 16; const a = 500 * (fx - fy); const labB = 200 * (fy - fz)
  const c = Math.sqrt(a * a + labB * labB); let h = Math.atan2(labB, a) * 180 / Math.PI
  if (h < 0) h += 360
  return { l, a, b: labB, c, h }
}

function rgbToOklab(r: number, g: number, b: number) {
  const linear = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const rn = linear(r); const gn = linear(g); const bn = linear(b)
  const l = Math.cbrt(0.4122214708 * rn + 0.5363325363 * gn + 0.0514459929 * bn)
  const m = Math.cbrt(0.2119034982 * rn + 0.6806995451 * gn + 0.1073969566 * bn)
  const s = Math.cbrt(0.0883024619 * rn + 0.2817188376 * gn + 0.6299787005 * bn)
  const outL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.sqrt(a * a + okB * okB); let h = Math.atan2(okB, a) * 180 / Math.PI
  if (h < 0) h += 360
  return { l: outL, a, b: okB, c, h }
}

export function translateColor(input: string) {
  const hex = normalizeHex(input) ?? '#6750A4'
  const { r, g, b, a } = hexChannels(hex)
  const hsl = rgbToHsl(r, g, b); const hsv = rgbToHsv(r, g, b); const cmyk = rgbToCmyk(r, g, b)
  const lab = rgbToLab(r, g, b); const oklab = rgbToOklab(r, g, b)
  const alpha = Number(a.toFixed(3))
  return [
    ['HEX / HEX8', hex],
    ['RGB / RGBA', `rgb(${r} ${g} ${b} / ${alpha})`],
    ['HSL / HSLA', `hsl(${hsl.h} ${hsl.s}% ${hsl.l}% / ${alpha})`],
    ['HSV / HSB', `hsv(${hsv.h} ${hsv.s}% ${hsv.v}% / ${alpha})`],
    ['HWB', `hwb(${hsv.h} ${Math.round(Math.min(r,g,b)/255*100)}% ${Math.round((255-Math.max(r,g,b))/255*100)}% / ${alpha})`],
    ['CIELAB / LCH', `lab(${lab.l.toFixed(2)}% ${lab.a.toFixed(2)} ${lab.b.toFixed(2)} / ${alpha}) · lch(${lab.l.toFixed(2)}% ${lab.c.toFixed(2)} ${lab.h.toFixed(2)} / ${alpha})`],
    ['OKLab / OKLCH', `oklab(${oklab.l.toFixed(4)} ${oklab.a.toFixed(4)} ${oklab.b.toFixed(4)} / ${alpha}) · oklch(${oklab.l.toFixed(4)} ${oklab.c.toFixed(4)} ${oklab.h.toFixed(2)} / ${alpha})`],
    ['CMYK', `device-cmyk(${cmyk.c}% ${cmyk.m}% ${cmyk.y}% ${cmyk.k}% / ${alpha})`],
  ] as const
}

export function relativeLuminance(input: string) {
  const { r, g, b } = hexChannels(input)
  const part = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * part(clamp(r)) + 0.7152 * part(clamp(g)) + 0.0722 * part(clamp(b))
}

export function contrastRatio(foreground: string, background: string) {
  const a = relativeLuminance(foreground); const b = relativeLuminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
