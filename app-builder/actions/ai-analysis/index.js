// Runs one AI analysis in the background: invoked (non-blocking) by assessments-admin with
// { analysisId } after it stored the input and prompt on the record. Decrypts the Amazon Bedrock API
// key with the private key (this is the only action that has it), calls Claude on Bedrock and
// stores the reply, or a short failure message, on the record. Not a web action.
const { withDb, findOneOrNull } = require('../lib/db')
const settings = require('../lib/settings')
const ai = require('../lib/ai')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function main (params) {
  const analysisId = String(params.analysisId || '')
  if (!UUID_RE.test(analysisId)) return { ok: false, error: 'invalid analysisId' }
  return withDb(params, async (client) => {
    const col = client.collection(ai.ANALYSES_COLLECTION)
    const doc = await findOneOrNull(col, { analysisId })
    if (!doc) return { ok: false, error: 'not found' }
    if (doc.status !== 'queued') return { ok: false, error: `already ${doc.status}` }
    await col.updateOne({ analysisId }, { $set: { status: 'running', startedAt: new Date().toISOString() } })

    const finish = async (fields) => {
      await col.updateOne({ analysisId }, { $set: { ...fields, finishedAt: new Date().toISOString() } })
      return { ok: fields.status === 'done', analysisId, status: fields.status }
    }

    const saved = await findOneOrNull(client.collection(settings.SETTINGS_COLLECTION), { key: settings.AI_KEY })
    if (!settings.hasKey(saved)) return finish({ status: 'failed', error: 'No API key is saved. Add one on the Settings page.' })
    let apiKey
    try {
      apiKey = settings.decrypt(saved.apiKey, params.aiKeyPrivate)
    } catch (e) {
      console.error('ai-analysis could not decrypt the API key:', e.message)
      return finish({ status: 'failed', error: 'The saved API key could not be decrypted. Save it again on the Settings page.' })
    }

    try {
      const res = await ai.analyze({ apiKey, input: doc.input, promptText: doc.promptText })
      console.log('ai-analysis', analysisId, res.model, res.stopReason, JSON.stringify(res.usage))
      if (res.stopReason === 'refusal') return finish({ status: 'failed', error: 'Claude declined this request.', model: res.model, stopReason: res.stopReason, usage: res.usage })
      return finish({
        status: 'done',
        output: res.text,
        model: res.model,
        stopReason: res.stopReason,
        usage: res.usage,
        ...(res.stopReason === 'max_tokens' ? { error: 'The reply hit the length limit and may be cut off.' } : {})
      })
    } catch (e) {
      console.error('ai-analysis failed:', e.name, e.status, e.message)
      return finish({ status: 'failed', error: ai.failureText(e) })
    }
  })
}

exports.main = main
