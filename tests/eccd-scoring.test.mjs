import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SCALED_LOOKUP, AGE_GROUPS, STANDARD_SCORE_TABLE } from '../src/lib/eccd/conversionTables.js'
import { MAX_RAW, CHECKLIST } from '../src/lib/eccd/checklistItems.js'
import * as s from '../src/lib/eccd/scoring.js'
test('item counts', () => assert.deepEqual(MAX_RAW, {grossMotor:13,fineMotor:11,selfHelp:27,receptiveLanguage:5,expressiveLanguage:8,cognitive:21,socioEmotional:24}))
test('every raw score 0..max converts, scaled never decreases', () => {
  for (const g of AGE_GROUPS) for (const [d,max] of Object.entries(MAX_RAW)) {
    let prev = 0
    for (let r=0;r<=max;r++){ const v=SCALED_LOOKUP[g.id][d][r]; assert.ok(v>=1&&v<=19,`${g.id} ${d} ${r}`); assert.ok(v>=prev,`${g.id} ${d} ${r} decreases`); prev=v }
    assert.equal(Object.keys(SCALED_LOOKUP[g.id][d]).length, max+1, `${g.id} ${d} has raw scores beyond max`)
  }
})
test('standard table monotonic 29..98', () => { let p=0; for(let k=29;k<=98;k++){assert.ok(STANDARD_SCORE_TABLE[k]>p);p=STANDARD_SCORE_TABLE[k]} })
test('spot checks vs printed tables', () => {
  const L=SCALED_LOOKUP
  assert.equal(L['3.1-4.0'].grossMotor[13],14); assert.equal(L['3.1-4.0'].selfHelp[27],16)
  assert.equal(L['3.1-4.0'].expressiveLanguage[5],6); assert.equal(L['3.1-4.0'].cognitive[21],19)
  assert.equal(L['4.1-5.0'].cognitive[21],16); assert.equal(L['4.1-5.0'].expressiveLanguage[8],11)
  assert.equal(L['5.1-5.11'].socioEmotional[24],13); assert.equal(L['5.1-5.11'].grossMotor[13],11)
})
test('age uses 30-day months', () => {
  assert.deepEqual(s.computeAge('1998-05-17','2001-03-12'), {years:2,months:9,days:25,totalMonths:33})
  assert.equal(s.getAgeGroup(s.computeAge('2022-01-10','2026-01-20')).id,'3.1-4.0')
  assert.equal(s.getAgeGroup(s.computeAge('2021-09-01','2026-09-28')).id,'4.1-5.0')
  assert.equal(s.getAgeGroup(s.computeAge('2023-09-28','2026-09-28')),null)
})
test('pipeline', () => {
  const all = Object.values(CHECKLIST).flat().map(i=>i.id)
  const r = s.scoreAssessment({birthDate:'2021-09-01',assessmentDate:'2026-09-28',checkedItemIds:all})
  assert.equal(r.ok,true); assert.equal(r.ageGroup,'4.1-5.0')
  assert.deepEqual(r.scaledScore,{grossMotor:13,fineMotor:14,selfHelp:14,receptiveLanguage:11,expressiveLanguage:11,cognitive:16,socioEmotional:13})
  assert.equal(r.totalScaledScore,92); assert.equal(r.standardScore,129)
  assert.equal(r.interpretation,'Slightly Advanced Development')
  const none = s.scoreAssessment({birthDate:'2021-09-01',assessmentDate:'2026-09-28',checkedItemIds:[]})
  assert.equal(none.totalScaledScore,8)
})
test('out of table sums do not invent a score', () => {
  assert.deepEqual(s.getStandardScore(20),{standardScore:null,rangeStatus:'below-table'})
  assert.equal(s.interpretResult({standardScore:null,rangeStatus:'below-table'}),'Significant Delay in Overall Development')
  assert.equal(s.interpretResult({standardScore:null,rangeStatus:'above-table'}),'Highly Advanced Development')
  assert.equal(s.getInterpretation(69),'Significant Delay in Overall Development'); assert.equal(s.getInterpretation(80),'Average Overall Development')
})
test('raw score entry matches checklist path', () => {
  const ids = [...CHECKLIST.grossMotor.slice(0,5), ...CHECKLIST.cognitive.slice(0,10)].map(i=>i.id)
  const viaChecklist = s.scoreAssessment({birthDate:'2021-09-01',assessmentDate:'2026-09-28',checkedItemIds:ids})
  const viaRaw = s.scoreRawScores({birthDate:'2021-09-01',assessmentDate:'2026-09-28',rawScore:{grossMotor:5,fineMotor:0,selfHelp:0,receptiveLanguage:0,expressiveLanguage:0,cognitive:10,socioEmotional:0}})
  assert.deepEqual(viaRaw, viaChecklist)
  assert.equal(s.scoreRawScores({birthDate:'2023-09-28',assessmentDate:'2026-09-28',rawScore:{}}).reason,'unsupported-age')
  assert.throws(() => s.scoreRawScores({birthDate:'2021-09-01',assessmentDate:'2026-09-28',rawScore:{grossMotor:14,fineMotor:0,selfHelp:0,receptiveLanguage:0,expressiveLanguage:0,cognitive:0,socioEmotional:0}}))
})
