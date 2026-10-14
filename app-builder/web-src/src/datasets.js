import React from 'react';
import { Fields, fmt } from './Detail';
// Labels come from the same copy source the EDS block's authored sheet is generated from.
import copySource from '../../../tools/importer/guided-discovery/copy.source.json';

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

// ---------- CJA migration assessment (collection cja_assessments) ----------
const country = (p) => (p.country === 'Other' ? p.countryOther : p.country);

function AssessmentBody({ item }) {
  const p = item.profile || {};
  const sections = Object.entries(item.sections || {});
  return (
    <>
      <h3>Profile</h3>
      <Fields rows={[
        ['Email', p.email], ['Phone', p.phone], ['Job title', p.jobTitle], ['Department', p.department],
        ['Organization', p.organization],
        ['Country', p.country === 'Other' ? `Other: ${p.countryOther}` : p.country],
        ['State / province', p.state], ['Postal code', p.postalCode],
        ['Primary product', p.primaryProduct], ['Industry', p.industry],
      ]} />
      <StatusFields item={item} />
      <h3>Guided sections</h3>
      {sections.length === 0 && <p className="muted">No section answers saved.</p>}
      {sections.map(([name, s]) => (
        <section key={name} className="section-block">
          <h4>{name} <span className="muted">saved {fmt(s.savedAt)}</span></h4>
          <Fields rows={Object.entries(s.answers || {})} />
        </section>
      ))}
      <h3>Summary</h3>
      {item.summary ? <pre>{JSON.stringify(item.summary, null, 2)}</pre> : <p className="muted">No summary stored.</p>}
    </>
  );
}

function StatusFields({ item }) {
  return (
    <>
      <h3>Status</h3>
      <Fields rows={[
        ['Status', item.status], ['Created', fmt(item.createdAt)], ['Updated', fmt(item.updatedAt)],
        ['Completed', fmt(item.completedAt)],
        ['Consent', item.consent ? `${item.consent.version} at ${fmt(item.consent.acceptedAt)}` : '—'],
        ['Source', item.source && item.source.source], ['Page', item.source && item.source.pageUrl],
        ['Referrer', item.source && item.source.referrer],
        ['UTM', item.source && item.source.utm ? JSON.stringify(item.source.utm) : '—'],
      ]} />
    </>
  );
}

// ---------- AA -> CJA Guided Discovery (collection gd_sessions) ----------
const byId = (rows, key = 'name') => Object.fromEntries((rows || []).map((r) => [r.id, r[key] || r.label || r.id]));
const L = {
  needs: byId(copySource.needs),
  buckets: byId(copySource.buckets),
  dfItems: byId(copySource.dfItems),
  segments: byId(copySource.segments),
  stages: byId(copySource.identityStages),
  governance: byId(copySource.governance),
  roles: byId(copySource.roles),
  capabilities: byId(copySource.capabilities),
  prompts: byId(copySource.prompts, 'question'),
  options: Object.fromEntries((copySource.prompts || []).map((p) => [p.id, byId(p.options, 'label')])),
  lead: Object.fromEntries(Object.entries(copySource.lead || {}).map(([k, opts]) => [k, byId(opts, 'label')])),
};
const lab = (map, id) => (id ? (map && map[id]) || id : '—');
const labs = (map, ids) => (ids && ids.length ? ids.map((id) => lab(map, id)) : []);
const HEADLINES = { 'migration-ready': 'Migration-Ready', 'building-your-case': 'Building Your Case', 'early-discovery': 'Early Discovery Stage' };
const SIZES = { small: 'Small', medium: 'Medium', large: 'Large' };
// the lead comes from the linked CJA assessment submission (attached by the admin action);
// `lead` is the pre-hand-off shape stored by early test sessions
const lead = (r) => r.leadProfile || r.lead || {};
const isOther = (l) => String(l.country || '').toLowerCase() === 'other';

function promptRows(answers) {
  return Object.entries(answers || {}).map(([pid, opts]) => [lab(L.prompts, pid), labs(L.options[pid], opts)]);
}

function GuidedDiscoveryBody({ item }) {
  const l = lead(item);
  const s = item.sections || {};
  const d = s.discovery || {};
  const df = s.dataFoundations || {};
  const r = item.result;
  const gov = (s.governance || {}).status || {};
  const roles = s.roles || {};
  const strat = s.strategyAdoption || {};
  return (
    <>
      <h3>Lead</h3>
      {!item.leadProfile && !item.lead && <p className="muted">Not linked to a CJA assessment submission.</p>}
      <Fields rows={[
        ['Linked submission', item.leadRef ? item.leadRef.submissionId : '—'],
        ['Email', l.email], ['Phone', l.phone], ['Job title', lab(L.lead.jobTitle, l.jobTitle)],
        ['Department', lab(L.lead.department, l.department)], ['Organization', l.organization],
        ['Country', isOther(l) ? `Other: ${l.countryOther}` : lab(L.lead.country, l.country)],
        ['State / province', l.state], ['Postal code', l.postalCode],
        ['Primary product', lab(L.lead.primaryProduct, l.primaryProduct)], ['Industry', lab(L.lead.industry, l.industry)],
      ]} />
      <h3>Recommendation</h3>
      {r ? (
        <Fields rows={[
          ['Headline', HEADLINES[r.headline] || r.headline], ['Engagement', SIZES[r.engagement] || r.engagement],
          ['Readiness', `${Math.round((r.readinessPct || 0) * 100)}% of the Data Foundations inventory`],
          ['Capabilities', labs(L.capabilities, (r.matchedCapabilities || []).map((m) => m.id))],
          ['Computed', fmt(r.computedAt)],
        ]} />
      ) : <p className="muted">Not completed yet; no recommendation computed.</p>}
      <StatusFields item={item} />
      <Fields rows={[
        ['Sections complete', (item.progress && item.progress.completed) || []],
        ['Last page', item.progress && item.progress.lastPage],
      ]} />
      <h3>Discovery</h3>
      <Fields rows={[['Focus', lab(L.buckets, d.focus)], ['Needs', labs(L.needs, d.needs)], ...promptRows(d.answers)]} />
      <h3>Data Foundations</h3>
      <Fields rows={[
        ['Tracked', labs(L.dfItems, df.selected)],
        ['Multiple / not sure', Object.entries(df.quantity || {}).map(([id, q]) => `${lab(L.dfItems, id)}: ${q}`)],
        ['In Data View', labs(L.dfItems, df.dataView)],
      ]} />
      <h3>Segmentation, identity, governance</h3>
      <Fields rows={[
        ['Priority segments', labs(L.segments, (s.segmentation || {}).prioritized)],
        ['Identity today', lab(L.stages, (s.identity || {}).current)],
        ['Identity target', lab(L.stages, (s.identity || {}).target)],
        ['Governance gaps', labs(L.governance, Object.keys(gov).filter((k) => gov[k] === 'gap'))],
        ['Already in place', labs(L.governance, Object.keys(gov).filter((k) => gov[k] === 'in-place'))],
      ]} />
      <h3>Roles & strategy</h3>
      <Fields rows={[
        ...Object.entries(roles.owners || {}).map(([id, name]) => [`${lab(L.roles, id)} owner`, name]),
        ['Needs follow-up', labs(L.roles, roles.followUp)],
        ...promptRows(strat.answers),
        ['AI capability picks', labs(L.capabilities, strat.aiCapabilityPicks)],
      ]} />
      {(s.inventoryReview && s.inventoryReview.added && s.inventoryReview.added.length) ? (
        <>
          <h3>Inventory additions</h3>
          <Fields rows={s.inventoryReview.added.map((a, i) => [a.name || `Item ${i + 1}`, a.note])} />
        </>
      ) : null}
    </>
  );
}

export const DATASETS = {
  'guided-discovery': {
    label: 'AA → CJA Guided Discovery',
    title: 'Guided Discovery sessions',
    file: 'guided-discovery',
    id: (r) => r.sessionId,
    name: (r) => `${lead(r).firstName || ''} ${lead(r).lastName || ''}`.trim() || 'Unlinked session',
    haystack: (r) => [lead(r).firstName, lead(r).lastName, lead(r).email, lead(r).organization, r.sessionId,
      r.result && r.result.headline, r.source && r.source.source].join(' ').toLowerCase(),
    table: [
      ['Created', (r) => when(r.createdAt)],
      ['Name', (r) => `${lead(r).firstName || ''} ${lead(r).lastName || ''}`.trim() || 'Not linked'],
      ['Email', (r) => lead(r).email],
      ['Organization', (r) => lead(r).organization],
      ['Product', (r) => lab(L.lead.primaryProduct, lead(r).primaryProduct)],
      ['Sections', (r) => `${((r.progress && r.progress.completed) || []).length} / 7`],
      ['Recommendation', (r) => (r.result ? `${HEADLINES[r.result.headline] || ''} · ${SIZES[r.result.engagement] || ''}` : '—')],
    ],
    csv: [
      { label: 'Created', value: (r) => r.createdAt }, { label: 'Status', value: (r) => r.status },
      { label: 'First name', value: (r) => lead(r).firstName }, { label: 'Last name', value: (r) => lead(r).lastName },
      { label: 'Email', value: (r) => lead(r).email }, { label: 'Phone', value: (r) => lead(r).phone },
      { label: 'Job title', value: (r) => lab(L.lead.jobTitle, lead(r).jobTitle) },
      { label: 'Department', value: (r) => lab(L.lead.department, lead(r).department) },
      { label: 'Organization', value: (r) => lead(r).organization },
      { label: 'Country', value: (r) => (isOther(lead(r)) ? lead(r).countryOther : lab(L.lead.country, lead(r).country)) },
      { label: 'Linked submission', value: (r) => (r.leadRef ? r.leadRef.submissionId : '') },
      { label: 'State', value: (r) => lead(r).state }, { label: 'Postal code', value: (r) => lead(r).postalCode },
      { label: 'Primary product', value: (r) => lab(L.lead.primaryProduct, lead(r).primaryProduct) },
      { label: 'Industry', value: (r) => lab(L.lead.industry, lead(r).industry) },
      { label: 'Sections complete', value: (r) => ((r.progress && r.progress.completed) || []).join('; ') },
      { label: 'Focus', value: (r) => lab(L.buckets, ((r.sections || {}).discovery || {}).focus) },
      { label: 'Needs', value: (r) => labs(L.needs, ((r.sections || {}).discovery || {}).needs).join('; ') },
      { label: 'DF items tracked', value: (r) => (((r.sections || {}).dataFoundations || {}).selected || []).length },
      { label: 'Headline', value: (r) => (r.result ? HEADLINES[r.result.headline] : '') },
      { label: 'Engagement', value: (r) => (r.result ? SIZES[r.result.engagement] : '') },
      { label: 'Capabilities', value: (r) => (r.result ? labs(L.capabilities, r.result.matchedCapabilities.map((m) => m.id)).join('; ') : '') },
      { label: 'Source', value: (r) => r.source && r.source.source },
      { label: 'Completed', value: (r) => r.completedAt }, { label: 'Session ID', value: (r) => r.sessionId },
    ],
    Body: GuidedDiscoveryBody,
  },
  assessments: {
    label: 'CJA migration assessment',
    title: 'CJA assessment submissions',
    file: 'cja-assessments',
    id: (r) => r.submissionId,
    name: (r) => `${r.profile.firstName} ${r.profile.lastName}`,
    haystack: (r) => [r.profile.firstName, r.profile.lastName, r.profile.email, r.profile.organization,
      r.profile.jobTitle, r.profile.country, r.profile.primaryProduct, r.profile.industry,
      r.source && r.source.source, r.submissionId].join(' ').toLowerCase(),
    table: [
      ['Created', (r) => when(r.createdAt)],
      ['Name', (r) => `${r.profile.firstName} ${r.profile.lastName}`],
      ['Email', (r) => r.profile.email],
      ['Organization', (r) => r.profile.organization],
      ['Country', (r) => country(r.profile)],
      ['Product', (r) => r.profile.primaryProduct],
      ['Industry', (r) => r.profile.industry],
      ['Source', (r) => (r.source && r.source.source) || '—'],
    ],
    csv: [
      { label: 'Created', value: (r) => r.createdAt }, { label: 'Status', value: (r) => r.status },
      { label: 'First name', value: (r) => r.profile.firstName }, { label: 'Last name', value: (r) => r.profile.lastName },
      { label: 'Email', value: (r) => r.profile.email }, { label: 'Phone', value: (r) => r.profile.phone },
      { label: 'Job title', value: (r) => r.profile.jobTitle }, { label: 'Department', value: (r) => r.profile.department },
      { label: 'Organization', value: (r) => r.profile.organization }, { label: 'Country', value: (r) => country(r.profile) },
      { label: 'State', value: (r) => r.profile.state }, { label: 'Postal code', value: (r) => r.profile.postalCode },
      { label: 'Primary product', value: (r) => r.profile.primaryProduct }, { label: 'Industry', value: (r) => r.profile.industry },
      { label: 'Source', value: (r) => r.source && r.source.source }, { label: 'Completed', value: (r) => r.completedAt },
      { label: 'Submission ID', value: (r) => r.submissionId },
    ],
    Body: AssessmentBody,
  },
};
