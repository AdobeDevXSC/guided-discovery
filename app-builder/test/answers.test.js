// Answer validation against the real question bank (fixture). Run with: npm test
const { validateStructured, sectionIdOf } = require('../actions/guided-discovery/schema')
const BANK = require('./fixtures/self-guided-questions.json')

const check = (section, answers) => validateStructured(section, { answers }, BANK[section])

describe('answer validation', () => {
  test('section keys: plain ids, legacy sc- prefix accepted, summary rejected', () => {
    expect(sectionIdOf('discovery')).toBe('discovery')
    expect(sectionIdOf('sc-discovery')).toBe('discovery')
    expect(sectionIdOf('summary')).toBeNull()
  })

  test('single and multiple choice', () => {
    expect(check('discovery', { focus: ['activation'] }).errors).toEqual({})
    expect(check('discovery', { focus: ['analysis', 'both'] }).errors).toEqual({ 'discovery.answers.focus': 'at most 1' })
    expect(check('discovery', { focus: ['nope'] }).errors).toEqual({ 'discovery.answers.focus': 'unknown option nope' })
    expect(check('discovery', { nope: ['x'] }).errors).toEqual({ 'discovery.answers.nope': 'unknown question' })
  })

  test('data foundations: tracked takes item keys, quantity takes item:choice', () => {
    expect(check('data-foundations', { tracked: ['evar-order'], quantity: ['evar-order:multiple'] }).errors).toEqual({})
    expect(check('data-foundations', { tracked: ['evar-order:multiple'] }).errors).toEqual({ 'data-foundations.answers.tracked': 'unknown option evar-order:multiple' })
    expect(check('data-foundations', { quantity: ['evar-order:lots'] }).errors).toEqual({ 'data-foundations.answers.quantity': 'invalid item answer evar-order:lots' })
  })

  test('governance sort: control:choice, one per control', () => {
    expect(check('governance', { status: ['consent:gap', 'data-labels:in-place'] }).errors).toEqual({})
    expect(check('governance', { status: ['consent:gap', 'consent:in-place'] }).errors).toEqual({ 'governance.answers.status': 'one answer per option' })
    expect(Object.keys(check('governance', { status: ['Consent:Gap for us'] }).errors)).toEqual(['governance.answers.status'])
  })

  test('roles: role=name and role:follow-up', () => {
    expect(check('roles', { owners: ['analyst=Pat Lee', 'engineer:follow-up'] }).errors).toEqual({})
    expect(check('roles', { owners: ['analyst:Pat Lee'] }).errors).toEqual({ 'roles.answers.owners': 'invalid owner answer analyst:Pat Lee' })
  })
})
