import React from 'react';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const show = (v) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined || v === '' ? '—' : String(v));

function Fields({ rows }) {
  return (
    <dl className="fields">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd>{show(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export default function Detail({ item, onClose }) {
  const p = item.profile || {};
  const sections = Object.entries(item.sections || {});
  return (
    <aside className="detail" aria-label="Submission detail">
      <div className="detail-head">
        <h2>{p.firstName} {p.lastName}</h2>
        <button type="button" className="ghost no-print" onClick={onClose}>Close</button>
      </div>
      <p className="muted">{item.submissionId}</p>

      <h3>Profile</h3>
      <Fields rows={[
        ['Email', p.email], ['Phone', p.phone], ['Job title', p.jobTitle], ['Department', p.department],
        ['Organization', p.organization],
        ['Country', p.country === 'Other' ? `Other: ${p.countryOther}` : p.country],
        ['State / province', p.state], ['Postal code', p.postalCode],
        ['Primary product', p.primaryProduct], ['Industry', p.industry],
      ]} />

      <h3>Status</h3>
      <Fields rows={[
        ['Status', item.status], ['Created', fmt(item.createdAt)], ['Updated', fmt(item.updatedAt)],
        ['Completed', fmt(item.completedAt)],
        ['Consent', item.consent ? `${item.consent.version} at ${fmt(item.consent.acceptedAt)}` : '—'],
        ['Source', item.source && item.source.source], ['Page', item.source && item.source.pageUrl],
        ['Referrer', item.source && item.source.referrer],
        ['UTM', item.source && item.source.utm ? JSON.stringify(item.source.utm) : '—'],
      ]} />

      <h3>Guided sections</h3>
      {sections.length === 0 && <p className="muted">No section answers saved.</p>}
      {sections.map(([name, s]) => (
        <section key={name} className="section-block">
          <h4>{name} <span className="muted">saved {fmt(s.savedAt)}</span></h4>
          <Fields rows={Object.entries(s.answers || {})} />
        </section>
      ))}

      <h3>Summary</h3>
      {item.summary
        ? <pre>{JSON.stringify(item.summary, null, 2)}</pre>
        : <p className="muted">No summary stored.</p>}
    </aside>
  );
}
