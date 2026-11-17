const ai = require('./ai')
const settings = require('./settings')
const template = require('./template')
const { findOneOrNull } = require('./db')

function comparePrompts (a, b) {
  const leftName = String(a.name || '')
  const rightName = String(b.name || '')
  if (leftName !== rightName) return leftName < rightName ? -1 : 1
  const leftId = String(a.promptId || '')
  const rightId = String(b.promptId || '')
  return leftId === rightId ? 0 : (leftId < rightId ? -1 : 1)
}

function sharedPrompt (prompts) {
  return [...(prompts || [])].sort(comparePrompts)[0] || null
}

async function loadConfiguration (client) {
  const store = client.collection(settings.SETTINGS_COLLECTION)
  const prompts = await client.collection(settings.PROMPTS_COLLECTION).find({}).limit(500).toArray()
  return {
    skill: await findOneOrNull(store, { key: settings.SKILL_KEY }),
    prompt: sharedPrompt(prompts),
    template: await findOneOrNull(store, { key: settings.TEMPLATE_KEY })
  }
}

function prepare ({ assessment, response, profile, sections, skill, prompt, template: savedTemplate }) {
  const templateText = savedTemplate && savedTemplate.text ? savedTemplate.text : null
  const profileText = ai.profileLines(profile)
  const input = [
    ...(profileText.length ? ['## Profile', '', ...profileText, ''] : []),
    ai.buildInput({ assessment, response, sections })
  ].join('\n')

  return {
    ...(prompt && prompt.promptId ? { promptId: prompt.promptId } : {}),
    promptName: prompt && prompt.name ? prompt.name : 'Wrap-up guide',
    promptText: prompt && prompt.text ? prompt.text : ai.WRAPUP_PROMPT,
    skillName: skill.name || '',
    systemText: settings.skillSystemText(skill) +
      (templateText ? template.outputInstructions(templateText) : ''),
    input,
    ...(templateText
      ? {
          templateText,
          computed: ai.computedFacts({ assessment, response, profile })
        }
      : {})
  }
}

module.exports = { comparePrompts, sharedPrompt, loadConfiguration, prepare }
