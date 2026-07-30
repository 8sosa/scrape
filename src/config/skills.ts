/**
 * Master vocabulary of BI/data/CRM/onboarding-relevant terms recognized when
 * scanning a lead's title+body for resume-fit scoring. Deliberately excludes
 * bare tokens that are common English words or ambiguous substrings to avoid
 * false-positive matches against unrelated text.
 */
export const SKILL_VOCABULARY: readonly string[] = [
  // BI / data / analytics
  'power bi',
  'tableau',
  'looker',
  'metabase',
  'sql',
  'excel',
  'excel vba',
  'ms office',
  'dax',
  'power query',
  'data analysis',
  'data analytics',
  'data analyst',
  'business intelligence',
  'bi analyst',
  'google data analytics',
  'forecasting',
  'predictive analysis',
  'dashboard',
  'dashboards',
  'reporting',
  'r programming',
  // CRM / customer / account management
  'crm',
  'salesforce',
  'hubspot',
  'gohighlevel',
  'go highlevel',
  'highlevel',
  'zapier',
  'clickup',
  'notion',
  'key account management',
  'kam',
  'account management',
  'customer success',
  'client relationship management',
  // Onboarding / support
  'onboarding',
  'client onboarding',
  'onboarding specialist',
  'implementation specialist',
  'customer onboarding',
  'customer support',
  'client support',
  // Ops / project management
  'project management',
  'process improvement',
  'stakeholder management',
  'inventory management',
  'ai integration',
  // Finance
  'financial analysis',
  'financial modeling',
];

/**
 * Maro Obatare's actual skills (extracted from his resume) — a subset of
 * SKILL_VOCABULARY. Edit this list directly to update matching; no need to
 * re-share a resume for changes.
 */
export const RESUME_SKILLS: readonly string[] = [
  'power bi',
  'tableau',
  'sql',
  'excel',
  'ms office',
  'data analysis',
  'business intelligence',
  'bi analyst',
  'data analyst',
  'google data analytics',
  'forecasting',
  'predictive analysis',
  'dashboard',
  'dashboards',
  'reporting',
  'r programming',
  'crm',
  'gohighlevel',
  'go highlevel',
  'highlevel',
  'zapier',
  'clickup',
  'notion',
  'key account management',
  'kam',
  'account management',
  'customer success',
  'client relationship management',
  'onboarding',
  'client onboarding',
  'onboarding specialist',
  'customer onboarding',
  'project management',
  'process improvement',
  'stakeholder management',
  'inventory management',
  'ai integration',
  'financial analysis',
];
