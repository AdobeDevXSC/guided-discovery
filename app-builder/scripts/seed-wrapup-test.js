#!/usr/bin/env node
// Seeds test profiles with completed facilitator-led answers on stage, to try the wrap-up LLM
// handoff without answering the assessment. Goes through the public endpoints (same validation as
// the real page), adds records only and never deletes anything.
//
//   node scripts/seed-wrapup-test.js            # creates the records and prints how to use them
//
// Every record uses a wrapup-test-*@example.com address and source "seed:wrapup-test", so they are
// easy to spot in the admin viewer. Each run creates new records.
const options = require('../actions/assessments/options.json')

const BASE = process.env.GD_BASE || 'https://20409-157ochretakin-stage.adobeio-static.net/api/v1/web/marketingprototype'
const SOURCE = 'seed:wrapup-test'
const PAGE = process.env.GD_PAGE || 'https://20409-157ochretakin-stage.adobeio-static.net/facilitator-practitioner.html'

const pick = (list, re, fallback) => list.find((x) => re.test(x)) || fallback || list[0]

const PERSONAS = [
  {
    key: 'acme',
    profile: {
      firstName: 'Avery', lastName: 'Testcase', email: 'wrapup-test-acme@example.com', phone: '555-0101',
      jobTitle: 'VP, Digital Analytics', department: 'Marketing Analytics', organization: 'Acme Retail (test)',
      country: pick(options.countries, /^United States/), state: 'California', postalCode: '94105',
      primaryProduct: 'Adobe Analytics', industry: pick(options.industries, /retail/i)
    },
    // mature: lots tracked, several segments, partial identity, governance gaps
    answers: {
      discovery: {
        focus: 'both',
        needs: ['personalization', 'segmentation'],
        success: ['faster-decisions', 'improved-customer-experience'],
        pain: ['data-is-siloed-across-channels', 'cant-see-cross-device-behavior'],
        'fix-one-thing': 'identity-stitching',
        stakeholders: ['marketing', 'it-engineering', 'executive-leadership'],
        'journey-dropoff': 'consideration-to-purchase',
        'segment-dropoff': 'yes-but-we-dont-fully-trust-the-data',
        'gap-type': 'both',
        'detection-speed': 'days',
        urgency: 'contract-license-renewal'
      },
      'data-foundations': {
        tracked: ['evar-product', 'evar-order', 'evar-campaign', 'prop-pagename'],
        quantity: ['evar-product:multiple', 'evar-order:one', 'evar-campaign:multiple', 'prop-pagename:unsure']
      },
      segmentation: { prioritized: ['cart-abandoners', 'high-value', 'multichannel'] },
      identity: { 'identity-current': 'deterministic-login', 'identity-target': 'unified-graph' },
      governance: { status: ['data-labels:gap', 'access-groups:in-place', 'usage-labels:gap', 'consent:in-place'] },
      roles: { owners: ['analyst=Pat Lee', 'marketer=Sam Rivera', 'engineer=Jordan Kim', 'admin=Casey Moore'] },
      'strategy-adoption': {
        'strategy-model': 'hybrid-model',
        'strategy-change': 'well-need-external-support',
        'strategy-blockers': ['unclear-ownership-of-next-steps', 'skills-gap-on-the-team'],
        'strategy-ai': 'actively-exploring',
        'ai-picks': ['connected-data', 'graph-stitching', 'journey-mapping']
      }
    }
  },
  {
    key: 'northwind',
    profile: {
      firstName: 'Morgan', lastName: 'Sample', email: 'wrapup-test-northwind@example.com', phone: '555-0102',
      jobTitle: 'Analytics Manager', department: 'Digital', organization: 'Northwind Media (test)',
      country: pick(options.countries, /^United States/), state: 'Washington', postalCode: '98101',
      primaryProduct: 'Adobe Analytics', industry: pick(options.industries, /media|entertain/i)
    },
    // early: little tracked, no identity, nothing governed, no AI plans
    answers: {
      discovery: {
        focus: 'analysis',
        needs: ['messaging'],
        success: ['better-roi-attribution'],
        pain: ['reports-arent-trusted', 'too-slow-to-get-answers'],
        'fix-one-thing': 'data-quality-and-trust',
        stakeholders: ['marketing'],
        'journey-dropoff': 'awareness-to-consideration',
        'segment-dropoff': 'we-dont-currently-segment-this-way',
        'gap-type': 'analytics-gap',
        'detection-speed': 'weeks',
        urgency: 'no-particular-urgency'
      },
      'data-foundations': { tracked: ['prop-pagename'], quantity: ['prop-pagename:one'] },
      segmentation: { prioritized: ['content-no-convert'] },
      identity: { 'identity-current': 'none', 'identity-target': 'deterministic-login' },
      governance: { status: ['data-labels:gap', 'access-groups:gap', 'usage-labels:gap', 'consent:gap'] },
      roles: { owners: ['analyst=Morgan Sample'] },
      'strategy-adoption': {
        'strategy-model': 'not-sure-yet',
        'strategy-change': 'not-sure-yet',
        'strategy-blockers': ['lack-of-automation-ai-tooling'],
        'strategy-ai': 'not-a-priority-right-now',
        'ai-picks': ['connected-data']
      }
    }
  }
]

async function post (path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error(`${path}: HTTP ${res.status} (not JSON)`) }
  if (!res.ok || data.ok === false) throw new Error(`${path}: HTTP ${res.status} ${JSON.stringify(data.errors || data.error || data).slice(0, 400)}`)
  return data
}

async function seed (p) {
  const created = await post('/assessments', { op: 'create', consent: true, assessment: 'facilitator-led', source: SOURCE, profile: p.profile })
  const started = await post('/guided-discovery', {
    op: 'start', assessment: 'facilitator-led', view: 'practitioner', leadRef: created.submissionId, source: SOURCE
  })
  const answers = Object.entries(p.answers).flatMap(([section, qs]) => Object.entries(qs).map(([question, value]) => ({ section, question, value })))
  await post('/guided-discovery', { op: 'answer', responseId: started.responseId, userId: created.userId, answers })
  await post('/guided-discovery', { op: 'save', responseId: started.responseId, progress: { completed: Object.keys(p.answers) } })
  await post('/guided-discovery', { op: 'complete', responseId: started.responseId })
  return { name: p.profile.organization, submissionId: created.submissionId, responseId: started.responseId, answers: answers.length }
}

async function main () {
  for (const p of PERSONAS) {
    const r = await seed(p)
    console.log(`${r.name}: ${r.answers} answers, completed`)
    console.log(`  submissionId ${r.submissionId}`)
    console.log(`  responseId   ${r.responseId}`)
    console.log(`  last step    ${PAGE}?wrapupTest=${r.responseId}\n`)
  }
}

main().catch((e) => { console.error('seed failed:', e.message); process.exit(1) })
