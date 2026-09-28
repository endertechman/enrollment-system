import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

let vite
let GuestHomeView
let SignedInHomeView

before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const guestModule = await vite.ssrLoadModule('/src/components/home/GuestHomeView.jsx')
  const signedInModule = await vite.ssrLoadModule('/src/components/home/SignedInHomeView.jsx')
  GuestHomeView = guestModule.default
  SignedInHomeView = signedInModule.default
})

after(async () => {
  await vite?.close()
})

function render(view) {
  return renderToString(React.createElement(MemoryRouter, null, view))
}

test('guest landing has registration actions and no signed-in schedule card', () => {
  const html = render(React.createElement(GuestHomeView, { enrollmentWindow: null }))
  assert.match(html, /Start Enrollment/)
  assert.match(html, /Sign Up/)
  assert.doesNotMatch(html, /home-schedule-card/)
})

test('parent landing shows active semester and enrollment dates instead of child status', () => {
  const html = render(React.createElement(SignedInHomeView, {
    role: 'parent',
    enrollments: [{ id: 'child-1' }],
    enrollmentWindow: {
      opens_at: '2026-09-16T08:00:00+08:00',
      closes_at: '2026-12-31T00:00:00+08:00',
    },
    enrollmentBatch: { name: 'S.Y. 2026', starts_on: '2026-11-02', ends_on: '2027-03-26' },
  }))
  assert.match(html, /S\.Y\. 2026/)
  assert.match(html, /Enrollment opens/)
  assert.match(html, /Enrollment closes/)
  assert.match(html, /Semester starts/)
  assert.match(html, /Semester ends/)
  assert.match(html, /Open Parent Dashboard/)
  assert.doesNotMatch(html, /Enrolled Child/)
})

test('teacher landing keeps its portal action and staff support panel', () => {
  const html = render(React.createElement(SignedInHomeView, {
    role: 'teacher', enrollments: [], enrollmentWindow: null, enrollmentBatch: null,
  }))
  assert.match(html, /Open Teacher Portal/)
  assert.doesNotMatch(html, /home-schedule-card/)
})

test('parent without an enrollment sees a start action and honest schedule placeholders', () => {
  const html = render(React.createElement(SignedInHomeView, {
    role: 'parent', enrollments: [], enrollmentWindow: null, enrollmentBatch: null,
  }))
  assert.match(html, /Start Enrollment/)
  assert.match(html, /To be announced/)
  assert.doesNotMatch(html, /Open Parent Dashboard/)
})

test('teacher aide landing keeps its own portal action', () => {
  const html = render(React.createElement(SignedInHomeView, {
    role: 'teacher_aide', enrollments: [], enrollmentWindow: null, enrollmentBatch: null,
  }))
  assert.match(html, /Open Teacher Aide Portal/)
  assert.doesNotMatch(html, /home-schedule-card/)
})
