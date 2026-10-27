import React from 'react';
import { Fields, fmt } from './Detail';
import ProfileAnswers from './ProfileAnswers';

// Assessments shown in the viewer, one tab each (the tab bar only appears once there are two).
// Each entry reads one admin-action dataset and lists the profile collected on that
// assessment's initial form. Add future assessments here.

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const country = (p) => (p.country === 'Other' ? p.countryOther : p.country);
const profile = (r) => r.profile || {};
const fullName = (r) => `${profile(r).firstName || ''} ${profile(r).lastName || ''}`.trim() || '—';

const LABELS = { 'self-guided': 'Self-guided assessment' };

// The profile's latest linked run (attached by the admin action): started or in progress = in process.
const isInProgress = (r) => Boolean(r.run && (r.run.status === 'started' || r.run.status === 'in_progress'));
function Progress({ r }) {
  if (!r.run) return <span className="pill progress">No answers</span>;
  if (r.run.status === 'completed') return <span className="pill progress completed">Completed</span>;
  return (
    <span
      className="pill progress in_progress"
      title={`${r.run.completedSections} of ${r.run.totalSections} sections complete · last saved ${when(r.run.updatedAt)}`}
    >
      {`In progress · ${r.run.answered}/${r.run.totalQuestions} answered`}
    </span>
  );
}
export const assessmentLabel = (r) => LABELS[r.assessment] || r.assessment || '—';

function ProfileBody({ item, auth }) {
  const p = profile(item);
  const s = item.source || {};
  return (
    <>
      <h3>Profile</h3>
      <Fields rows={[
        ['First name', p.firstName], ['Last name', p.lastName],
        ['Email', p.email], ['Phone', p.phone], ['Job title', p.jobTitle], ['Department', p.department],
        ['Organization', p.organization],
        ['Country', p.country === 'Other' ? `Other: ${p.countryOther}` : p.country],
        ['State / province', p.state], ['Postal code', p.postalCode],
        ['Primary product', p.primaryProduct], ['Industry', p.industry],
      ]} />
      <h3>Submission</h3>
      <Fields rows={[
        ['Assessment', assessmentLabel(item)],
        ['Submitted', fmt(item.createdAt)],
        ['User ID', item.userId], ['Submission ID', item.submissionId],
        ['Consent', item.consent ? `${item.consent.version} at ${fmt(item.consent.acceptedAt)}` : '—'],
        ['Source', s.source], ['Page', s.pageUrl], ['Referrer', s.referrer],
        ['UTM', s.utm ? JSON.stringify(s.utm) : '—'],
      ]} />
      {auth && <ProfileAnswers submissionId={item.submissionId} token={auth.token} org={auth.org} />}
    </>
  );
}

export const ASSESSMENTS = {
  'self-guided': {
    label: LABELS['self-guided'],
    dataset: 'assessments',
    assessment: 'self-guided',
    file: 'self-guided-assessment-profiles',
    id: (r) => r.submissionId,
    name: fullName,
    person: (r) => r.userId || profile(r).email,
    inProgress: isInProgress,
    haystack: (r) => {
      const p = profile(r);
      return [p.firstName, p.lastName, p.email, p.phone, p.jobTitle, p.department, p.organization,
        country(p), p.state, p.postalCode, p.primaryProduct, p.industry, r.userId, r.submissionId]
        .join(' ').toLowerCase();
    },
    table: [
      ['Submitted', (r) => when(r.createdAt)],
      ['Assessment', (r) => <span className="pill assessment">{assessmentLabel(r)}</span>],
      ['Progress', (r) => <Progress r={r} />],
      ['Name', fullName],
      ['Email', (r) => profile(r).email],
      ['Phone', (r) => profile(r).phone],
      ['Job title', (r) => profile(r).jobTitle],
      ['Department', (r) => profile(r).department],
      ['Organization', (r) => profile(r).organization],
      ['Country', (r) => country(profile(r))],
      ['State', (r) => profile(r).state],
      ['Postal code', (r) => profile(r).postalCode],
      ['Product', (r) => profile(r).primaryProduct],
      ['Industry', (r) => profile(r).industry],
    ],
    csv: [
      { label: 'Submitted', value: (r) => r.createdAt },
      { label: 'Assessment', value: assessmentLabel },
      { label: 'First name', value: (r) => profile(r).firstName },
      { label: 'Last name', value: (r) => profile(r).lastName },
      { label: 'Email', value: (r) => profile(r).email },
      { label: 'Phone', value: (r) => profile(r).phone },
      { label: 'Job title', value: (r) => profile(r).jobTitle },
      { label: 'Department', value: (r) => profile(r).department },
      { label: 'Organization', value: (r) => profile(r).organization },
      { label: 'Country', value: (r) => country(profile(r)) },
      { label: 'State', value: (r) => profile(r).state },
      { label: 'Postal code', value: (r) => profile(r).postalCode },
      { label: 'Primary product', value: (r) => profile(r).primaryProduct },
      { label: 'Industry', value: (r) => profile(r).industry },
      { label: 'Source', value: (r) => r.source && r.source.source },
      { label: 'User ID', value: (r) => r.userId },
      { label: 'Submission ID', value: (r) => r.submissionId },
    ],
    Body: ProfileBody,
    exportAnswers: true,
  },
};

const words = (id) => (id ? String(id).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

/**
 * The profile columns followed by the latest linked run's status, result and one column per
 * question (page order). `exported` is the admin answers-export payload { columns, rows }.
 */
export function answerColumns(ds, exported) {
  const run = (r) => (exported.rows || {})[r.submissionId] || null;
  const pick = (fn) => (r) => { const x = run(r); return x ? fn(x) : ''; };
  return [
    ...ds.csv,
    { label: 'Answers: status', value: pick((x) => x.status.replace('_', ' ')) },
    { label: 'Answers: runs', value: pick((x) => x.runs) },
    { label: 'Answers: started', value: pick((x) => x.startedAt) },
    { label: 'Answers: last saved', value: pick((x) => x.updatedAt) },
    { label: 'Answers: completed', value: pick((x) => x.completedAt || '') },
    { label: 'Sections complete', value: pick((x) => x.completedSections) },
    { label: 'Readiness %', value: pick((x) => (x.readinessPct === null ? '' : Math.round(x.readinessPct * 100))) },
    { label: 'Headline', value: pick((x) => words(x.headline)) },
    { label: 'Engagement', value: pick((x) => words(x.engagement)) },
    { label: 'Capabilities', value: pick((x) => x.capabilities.join('; ')) },
    ...(exported.columns || []).map((c) => ({
      label: `${c.sectionTitle}: ${c.text} [${c.key}]`,
      value: pick((x) => x.answers[c.key] || ''),
    })),
  ];
}
