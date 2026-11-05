// Each assessment's scoring rules (readiness bands, engagement sizes, capabilities), keyed by
// assessment. Most come from scoring-config.json; an assessment listed in SAME_AS scores with
// another's rules (facilitator-led asks the self-guided questions, so it scores the same way).
// An assessment exists when it has rules here.
const CONFIG = require('./scoring-config.json')

const SAME_AS = { 'facilitator-led': 'self-guided' }

module.exports = {
  ...CONFIG,
  ...Object.fromEntries(Object.entries(SAME_AS).map(([id, from]) => [id, CONFIG[from]]))
}
