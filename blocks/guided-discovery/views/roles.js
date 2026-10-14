/* Roles & Stakeholders (copy doc 5.10): who owns the shift for each of the four roles. */
import { h } from '../lib/dom.js';
import { ROLES } from '../lib/catalog.js';
import { header, footer, toggleIn } from './common.js';

export default function renderRoles(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const { roles } = store.state.sections;

  return h(
    'section',
    { class: 'gd-roles' },
    header(ctx, { eyebrow: 'roles.eyebrow', heading: 'roles.heading' }),
    h('div', { class: 'gd-cards gd-role-cards' }, ROLES.map((role) => {
      const c = copy.item('roles', role);
      const ownerId = `gd-owner-${role}`;
      const owner = h('input', {
        id: ownerId, type: 'text', maxlength: '120', placeholder: t('roles.ownerPlaceholder'), value: roles.owners[role] || '',
      });
      // typing must not re-render (it would drop focus), so save without rendering
      owner.addEventListener('input', () => store.update('roles', (s) => {
        if (owner.value.trim()) s.owners[role] = owner.value;
        else delete s.owners[role];
      }, { render: false }));
      const flagged = roles.followUp.includes(role);
      return h(
        'article',
        { class: 'gd-card gd-role' },
        h('h4', { text: c.name }),
        h('dl', {}, [['roles.from', c.from], ['roles.to', c.to], ['roles.newSkill', c.newSkill], ['roles.quickWin', c.quickWin]]
          .filter(([, v]) => v).map(([k, v]) => [h('dt', { text: t(k) }), h('dd', { text: v })])),
        h('label', { for: ownerId, text: t('roles.owner') }),
        owner,
        h(
          'label',
          { class: 'gd-check' },
          h('input', {
            type: 'checkbox', checked: flagged, onChange: () => store.update('roles', (s) => toggleIn(s.followUp, role)),
          }),
          ` ${t('roles.followUp')}`,
        ),
      );
    })),
    footer(ctx, 'roles', { text: 'roles.footer' }),
  );
}
