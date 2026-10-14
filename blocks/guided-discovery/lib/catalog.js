/*
 * Guided Discovery catalog: stable IDs and structure only (no copy). Shared by the EDS block
 * and the App Builder action (app-builder/actions/guided-discovery), which validates against it.
 * Generated once from the live app's data literals
 * (landing.adobe.com/acs/AA-to-CJA-Guided-Discovery.html).
 * Labels and descriptions live in the authored copy sheet, keyed by these IDs. Changing an ID is a
 * breaking change for stored sessions.
 */

export const PAGES = [
  'overview',
  'discovery',
  'hub',
  'data-foundations',
  'segmentation',
  'identity',
  'governance',
  'roles',
  'strategy-adoption',
  'summary',
];

export const REFERENCE_PAGES = [
  'crosswalk',
  'architecture',
];

export const HUB_PAGES = [
  'data-foundations',
  'segmentation',
  'identity',
  'governance',
  'roles',
  'strategy-adoption',
];

export const BUCKETS = [
  'analysis',
  'activation',
  'both',
];

export const NEEDS = [
  {
    id: 'personalization',
    bucket: 'activation',
  },
  {
    id: 'messaging',
    bucket: 'activation',
  },
  {
    id: 'content-supply-chain',
    bucket: 'analysis',
  },
  {
    id: 'segmentation',
    bucket: 'both',
  },
  {
    id: 'brand-visibility',
    bucket: 'analysis',
  },
  {
    id: 'customer-experience',
    bucket: 'both',
  },
  {
    id: 'modernizing-docs',
    bucket: 'analysis',
  },
  {
    id: 'real-time-activation',
    bucket: 'activation',
  },
  {
    id: 'cross-channel-measurement',
    bucket: 'analysis',
  },
  {
    id: 'governance-compliance',
    bucket: 'both',
  },
];

export const PROMPTS = [
  {
    id: 'success',
    group: 'open',
    single: false,
    options: [
      'faster-decisions',
      'better-roi-attribution',
      'improved-customer-experience',
      'organizational-recognition',
      'cost-savings',
      'not-sure-yet',
    ],
  },
  {
    id: 'pain',
    group: 'open',
    single: false,
    options: [
      'data-is-siloed-across-channels',
      'reports-arent-trusted',
      'cant-see-cross-device-behavior',
      'too-slow-to-get-answers',
      'no-significant-pain-today',
      'not-sure-yet',
    ],
  },
  {
    id: 'fix-one-thing',
    group: 'open',
    single: true,
    options: [
      'identity-stitching',
      'data-quality-and-trust',
      'speed-of-access',
      'governance-access-control',
      'reporting-flexibility',
      'not-sure-yet',
    ],
  },
  {
    id: 'stakeholders',
    group: 'open',
    single: false,
    options: [
      'marketing',
      'it-engineering',
      'executive-leadership',
      'compliance-legal',
      'customer-service',
      'not-sure-yet',
    ],
  },
  {
    id: 'journey-dropoff',
    group: 'deeper',
    single: true,
    gauge: 'journey',
    options: [
      'awareness-to-consideration',
      'consideration-to-purchase',
      'purchase-to-retention',
      'onboarding',
      'dont-know',
      'not-applicable',
    ],
  },
  {
    id: 'segment-dropoff',
    group: 'deeper',
    single: true,
    options: [
      'yes-and-we-track-it-well',
      'yes-but-we-dont-fully-trust-the-data',
      'we-dont-currently-segment-this-way',
      'no-noticeable-difference',
      'not-sure',
    ],
  },
  {
    id: 'gap-type',
    group: 'deeper',
    single: true,
    options: [
      'analytics-gap',
      'segmentation-gap',
      'both',
      'neither',
      'not-sure',
    ],
  },
  {
    id: 'detection-speed',
    group: 'deeper',
    single: true,
    gauge: 'clock',
    options: [
      'real-time-near-real-time',
      'days',
      'weeks',
      'months',
      'we-dont-currently-monitor-this',
    ],
  },
  {
    id: 'urgency',
    group: 'deeper',
    single: true,
    options: [
      'contract-license-renewal',
      'product-deprecation',
      'strategic-initiative',
      'no-particular-urgency',
      'not-sure',
    ],
  },
  {
    id: 'strategy-model',
    group: 'strategy',
    single: true,
    bucket: 'both',
    options: [
      'centralized-analytics-team-center-of-excellence',
      'federated-across-business-units',
      'hybrid-model',
      'not-sure-yet',
    ],
  },
  {
    id: 'strategy-change',
    group: 'strategy',
    single: true,
    bucket: 'both',
    options: [
      'we-have-dedicated-enablement-resources',
      'well-need-external-support',
      'leaderships-bought-in-but-teams-need-convincing',
      'not-sure-yet',
    ],
  },
  {
    id: 'strategy-blockers',
    group: 'strategy',
    single: false,
    bucket: 'activation',
    options: [
      'unclear-ownership-of-next-steps',
      'too-slow-to-operationalize-into-campaigns-journeys',
      'lack-of-automation-ai-tooling',
      'skills-gap-on-the-team',
      'not-sure-yet',
    ],
  },
  {
    id: 'strategy-ai',
    group: 'strategy',
    single: true,
    gauge: 'signal',
    bucket: 'activation',
    options: [
      'not-a-priority-right-now',
      'not-yet-but-interested',
      'actively-exploring',
      'not-sure-yet',
    ],
  },
];

export const TIERS = [
  'foundation',
  'parity',
  'expansion',
];

export const DF_CATEGORIES = [
  'commerce',
  'engagement',
  'identity',
  'marketing',
  'governance',
  'media',
  'attribution',
];

export const DF_ITEMS = [
  {
    id: 'evar-product',
    category: 'commerce',
    bucket: 'analysis',
    tier: 'foundation',
    complexity: 'low',
    field: 'productListItems.SKU',
  },
  {
    id: 'evar-order',
    category: 'commerce',
    bucket: 'analysis',
    tier: 'foundation',
    complexity: 'low',
    field: 'commerce.order.purchaseID',
  },
  {
    id: 'evar-campaign',
    category: 'marketing',
    bucket: 'both',
    tier: 'foundation',
    complexity: 'low',
    field: 'marketing.trackingCode',
  },
  {
    id: 'prop-pagename',
    category: 'engagement',
    bucket: 'analysis',
    tier: 'foundation',
    complexity: 'low',
    field: 'web.webPageDetails.name',
  },
  {
    id: 'prop-section',
    category: 'engagement',
    bucket: 'analysis',
    tier: 'foundation',
    complexity: 'low',
    field: 'web.webPageDetails.siteSection',
  },
  {
    id: 'evar-custom-conv',
    category: 'commerce',
    bucket: 'analysis',
    tier: 'parity',
    complexity: 'medium',
    field: '_yourorg.customDimension',
  },
  {
    id: 'mcvid',
    category: 'identity',
    bucket: 'both',
    tier: 'foundation',
    complexity: 'low',
    field: 'identityMap.ECID',
  },
  {
    id: 'crmid',
    category: 'identity',
    bucket: 'both',
    tier: 'foundation',
    complexity: 'medium',
    field: 'identityMap.CRMID',
  },
  {
    id: 'succ-orders',
    category: 'commerce',
    bucket: 'analysis',
    tier: 'foundation',
    complexity: 'low',
    field: 'commerce.order',
  },
  {
    id: 'succ-cartadd',
    category: 'commerce',
    bucket: 'analysis',
    tier: 'foundation',
    complexity: 'low',
    field: 'commerce.productListAdds',
  },
  {
    id: 'succ-custom',
    category: 'engagement',
    bucket: 'analysis',
    tier: 'foundation',
    complexity: 'low',
    field: '_yourorg.customEvent',
  },
  {
    id: 'processing-rules',
    category: 'governance',
    bucket: 'analysis',
    tier: 'parity',
    complexity: 'medium',
    field: 'Data Prep transformation',
  },
  {
    id: 'classifications',
    category: 'governance',
    bucket: 'analysis',
    tier: 'parity',
    complexity: 'medium',
    field: 'lookup dataset',
  },
  {
    id: 'segments',
    category: 'engagement',
    bucket: 'both',
    tier: 'parity',
    complexity: 'medium',
    field: 'Segment Builder',
  },
  {
    id: 'calc-metrics',
    category: 'engagement',
    bucket: 'analysis',
    tier: 'parity',
    complexity: 'medium',
    field: 'Calculated Metric Builder',
  },
  {
    id: 'vrs',
    category: 'governance',
    bucket: 'analysis',
    tier: 'foundation',
    complexity: 'medium',
    field: 'Connection / Data View',
  },
  {
    id: 'cross-device',
    category: 'identity',
    bucket: 'activation',
    tier: 'expansion',
    complexity: 'high',
    field: 'Identity Graph',
  },
  {
    id: 'heartbeat',
    category: 'media',
    bucket: 'analysis',
    tier: 'parity',
    complexity: 'medium',
    field: 'mediaAnalytics',
  },
  {
    id: 'mobile-sdk',
    category: 'identity',
    bucket: 'both',
    tier: 'foundation',
    complexity: 'medium',
    field: 'Edge Mobile SDK',
  },
  {
    id: 'offline-batch',
    category: 'identity',
    bucket: 'activation',
    tier: 'expansion',
    complexity: 'high',
    field: 'Batch Source Connector',
  },
  {
    id: 'attribution',
    category: 'attribution',
    bucket: 'activation',
    tier: 'expansion',
    complexity: 'high',
    field: 'Attribution Panel',
  },
  {
    id: 'anomaly',
    category: 'engagement',
    bucket: 'analysis',
    tier: 'expansion',
    complexity: 'medium',
    field: 'Intelligent Alerts',
  },
  {
    id: 'dw-export',
    category: 'governance',
    bucket: 'analysis',
    tier: 'expansion',
    complexity: 'medium',
    field: 'Query Service',
  },
  {
    id: 'debugger',
    category: 'governance',
    bucket: 'both',
    tier: 'foundation',
    complexity: 'low',
    field: 'AEP Assurance',
  },
];

export const DF_QUANTITIES = [
  'one',
  'multiple',
  'unsure',
];

export const SEGMENTS = [
  {
    id: 'cart-abandoners',
    bucket: 'activation',
    complexity: 'low',
  },
  {
    id: 'high-value',
    bucket: 'both',
    complexity: 'medium',
  },
  {
    id: 'multichannel',
    bucket: 'both',
    complexity: 'medium',
  },
  {
    id: 'content-no-convert',
    bucket: 'activation',
    complexity: 'low',
  },
  {
    id: 'churn-risk',
    bucket: 'activation',
    complexity: 'medium',
  },
  {
    id: 'campaign-responders',
    bucket: 'both',
    complexity: 'medium',
  },
  {
    id: 'service-interaction',
    bucket: 'analysis',
    complexity: 'high',
  },
  {
    id: 'new-vs-returning',
    bucket: 'analysis',
    complexity: 'low',
  },
];

export const IDENTITY_STAGES = [
  'none',
  'deterministic-login',
  'cross-channel',
  'unified-graph',
];

export const GOVERNANCE = [
  'data-labels',
  'access-groups',
  'usage-labels',
  'consent',
];

export const GOV_STATUSES = [
  'gap',
  'in-place',
];

export const ROLES = [
  'analyst',
  'marketer',
  'engineer',
  'admin',
];

export const CAPABILITIES = [
  'connected-data',
  'graph-stitching',
  'data-transformations',
  'journey-mapping',
  'attribution',
  'experimentation',
  'ai-capabilities',
  'content-analytics',
];

export const AI_PROMPT_CAPABILITIES = [
  'ai-capabilities',
  'experimentation',
  'data-transformations',
  'connected-data',
];

export const NEED_TO_CAPABILITY = {
  personalization: [
    'ai-capabilities',
  ],
  messaging: [
    'journey-mapping',
  ],
  'content-supply-chain': [
    'content-analytics',
  ],
  segmentation: [
    'graph-stitching',
  ],
  'brand-visibility': [
    'attribution',
  ],
  'customer-experience': [
    'journey-mapping',
  ],
  'modernizing-docs': [
    'data-transformations',
  ],
  'real-time-activation': [
    'ai-capabilities',
    'connected-data',
  ],
  'cross-channel-measurement': [
    'attribution',
    'graph-stitching',
  ],
  'governance-compliance': [
    'data-transformations',
  ],
};

export const LEAD_OPTIONS = {
  jobTitle: [
    'c-suite-executive',
    'vice-president',
    'director',
    'manager',
    'individual-contributor-or-practitioner',
    'other',
  ],
  department: [
    'marketing',
    'analytics',
    'insights',
    'it',
    'technology',
    'sales',
    'customer-experience',
    'other',
  ],
  country: [
    'united-states',
    'canada',
    'united-kingdom',
    'australia',
    'germany',
    'france',
    'japan',
    'india',
    'other',
  ],
  primaryProduct: [
    'customer-journey-analytics',
    'adobe-analytics',
    'adobe-experience-platform',
    'adobe-journey-optimizer',
    'real-time-cdp',
    'other',
  ],
  industry: [
    'retail',
    'financial-services',
    'media-and-travel',
    'healthcare',
    'other',
    'not-listed',
  ],
};
