import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mediaKind, looksLikeSheet, withLastFrameSentence } from '../admin/assets/studio-media.js'

test('simple mediaKind unlocks video without stealing audio/mp4', () => {
  assert.equal(mediaKind({ type: 'video/mp4', name: 'motion.mp4' }), 'video')
  assert.equal(mediaKind({ type: 'video/quicktime', name: 'clip.mov' }), 'video')
  assert.equal(mediaKind({ type: '', name: 'ref.webm' }), 'video')
  assert.equal(mediaKind({ type: 'audio/mp4', name: 'voice.m4a' }), 'audio')
  assert.equal(mediaKind({ type: 'image/png', name: 'face.png' }), 'image')
  assert.equal(mediaKind({ type: 'application/pdf', name: 'notes.pdf' }), '')
})

test('sheet-looking stills are the only first-frame warning surface', () => {
  assert.equal(looksLikeSheet({ kind: 'image', name: 'richie-sheet.png', width: 800, height: 800 }), true)
  assert.equal(looksLikeSheet({ kind: 'image', name: 'still.jpg', width: 2400, height: 800 }), true)
  assert.equal(looksLikeSheet({ kind: 'image', name: 'portrait.jpg', width: 800, height: 1000 }), false)
  assert.equal(looksLikeSheet({ kind: 'video', name: 'sheet.mp4', width: 2400, height: 800 }), false)
})

test('last-frame intent stays prompt text and can be removed', () => {
  assert.equal(withLastFrameSentence('Walk in.', '@Image2', true), 'Walk in. @Image2 is the last frame')
  assert.equal(withLastFrameSentence('Walk in. @Image2 is the last frame', '@Image2', true), 'Walk in. @Image2 is the last frame')
  assert.equal(withLastFrameSentence('Walk in. @Image2 is the last frame', '@Image2', false), 'Walk in.')
})
