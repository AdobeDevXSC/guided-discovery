const profileQuestions = require('../actions/lib/profile-questions')

describe('RFI profile question definitions', () => {
  const seeded = profileQuestions.defaults('2026-01-01T00:00:00.000Z')

  test('seeds each profile intake field with its existing label and field mapping', () => {
    expect(seeded).toHaveLength(13)
    expect(seeded.every((q) => q.section === 'rfi-intake' && q.sectionTitle === 'RFI intake' && q.sectionOrder === 7)).toBe(true)
    expect(seeded.map(({ field }) => field)).toEqual([
      'firstName', 'lastName', 'email', 'phone', 'jobTitle', 'department',
      'organization', 'country', 'countryOther', 'state', 'postalCode',
      'primaryProduct', 'industry'
    ])
    const countries = seeded.find((q) => q.field === 'country').options.map((o) => o.label)
    expect(countries[0]).toBe('United States')
    expect(countries).toEqual(expect.arrayContaining(require('../actions/assessments/options.json').countries))
    expect(seeded.find((q) => q.field === 'countryOther').required).toBe(false)
  })

  test('seeds missing questions once without overwriting existing definitions', async () => {
    const docs = []
    const col = {
      find: () => ({ limit: () => ({ toArray: async () => docs }) }),
      insertOne: async (doc) => docs.push(doc)
    }

    await profileQuestions.seedMissing(col)
    docs[0].title = 'Admin edit'
    await profileQuestions.seedMissing(col)

    expect(docs).toHaveLength(13)
    expect(docs[0].title).toBe('Admin edit')
  })

  test('seeds definitions when the collection does not exist yet', async () => {
    const docs = []
    let collectionMissing = true
    const col = {
      find: () => ({
        limit: () => ({
          toArray: async () => {
            if (collectionMissing) {
              collectionMissing = false
              throw new Error('Collection not found')
            }
            return docs
          }
        })
      }),
      insertOne: async (doc) => docs.push(doc)
    }

    await profileQuestions.seedMissing(col)

    expect(docs).toHaveLength(13)
  })

  test('updates text and option labels while keeping field identity and saved option keys', () => {
    const existing = seeded.find((q) => q.field === 'country')
    const { doc, errors } = profileQuestions.validateEdit({
      title: 'Country or region',
      help: 'Choose your location.',
      required: false,
      options: [
        { key: existing.options[0].id, label: 'Australia / Oceania' },
        ...existing.options.slice(1).map((option) => ({ key: option.id, label: option.label }))
      ]
    }, existing, '2026-02-01T00:00:00.000Z', 'admin@example.com')

    expect(errors).toEqual({})
    expect(doc.title).toBe('Country or region')
    expect(doc.required).toBe(false)
    expect(doc.options[0]).toEqual({ id: existing.options[0].id, label: 'Australia / Oceania' })
    expect(doc.updatedBy).toBe('admin@example.com')
  })

  test('rejects removing saved options and adding options to text fields', () => {
    const select = seeded.find((q) => q.field === 'country')
    const removed = profileQuestions.validateEdit({
      title: 'Country', options: select.options.slice(1)
    }, select, 'now', '')
    expect(removed.errors.options).toContain('saved options cannot be removed')

    const text = seeded.find((q) => q.field === 'firstName')
    const withOptions = profileQuestions.validateEdit({
      title: 'First name', options: [{ key: 'name', label: 'Name' }]
    }, text, 'now', '')
    expect(withOptions.errors.options).toBe('text questions have no options')
  })
})
