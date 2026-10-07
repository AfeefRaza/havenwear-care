#!/usr/bin/env node
/**
 * Generates the PWA icons from one SVG (charcoal rounded square, white "H" with a
 * warm accent dot). Run with `npm run icons`; output goes to public/.
 */
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = (size, { rounded, pad }) => {
  const r = rounded ? size * 0.22 : 0
  const g0 = size * pad
  const g = size - 2 * g0
  const bar = g * 0.15
  const x1 = g0 + g * 0.25
  const x2 = g0 + g * 0.75 - bar
  const y1 = g0 + g * 0.22
  const h = g * 0.56
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#14171f"/>
  <rect x="${x1}" y="${y1}" width="${bar}" height="${h}" rx="${bar * 0.2}" fill="#ffffff"/>
  <rect x="${x2}" y="${y1}" width="${bar}" height="${h}" rx="${bar * 0.2}" fill="#ffffff"/>
  <rect x="${x1}" y="${y1 + h / 2 - bar / 2}" width="${x2 - x1 + bar}" height="${bar}" fill="#ffffff"/>
  <circle cx="${g0 + g * 0.82}" cy="${g0 + g * 0.2}" r="${g * 0.065}" fill="#e2a05b"/>
</svg>`
}

const out = async (file, size, opts) => {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(`public/${file}`)
  console.log('wrote', file)
}

writeFileSync('public/favicon.svg', svg(64, { rounded: true, pad: 0.12 }))
await out('pwa-192.png', 192, { rounded: true, pad: 0.12 })
await out('pwa-512.png', 512, { rounded: true, pad: 0.12 })
await out('pwa-maskable-512.png', 512, { rounded: false, pad: 0.22 })
await out('apple-touch-icon.png', 180, { rounded: false, pad: 0.16 })
