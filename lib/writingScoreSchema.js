const BAND_NUMBER_SCHEMA = {
  type: 'number',
  minimum: 0,
  maximum: 9,
  multipleOf: 0.5,
};

// `includeRewrite` adds a short model rewrite of the essay's weakest paragraph.
// It is OPT-IN because OpenAI structured outputs require every declared
// property, so switching it on unconditionally would add output tokens to every
// caller. Only the full Writing scorer (pages/api/score/writing.js) asks for it;
// the Band Estimator's short-sample scorer deliberately does not, so its cost
// is unchanged. See docs/AI-COST-CONTROLS.md.
export function buildWritingScoreSchema(task, { includeRewrite = false } = {}) {
  const firstLabel = task === 1 ? 'taskAchievement' : 'taskResponse';
  const criterion = {
    type: 'object',
    additionalProperties: false,
    properties: {
      band: {
        ...BAND_NUMBER_SCHEMA,
        description: 'IELTS band from 0 to 9, in half-band increments',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
        description:
          '1-3 bullets, each under 20 words, naming something the candidate did well on this criterion with brief quoted evidence',
      },
      improvements: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
        description:
          '1-3 actionable bullets, each under 20 words, naming what would raise this band, citing the essay where possible',
      },
    },
    required: ['band', 'strengths', 'improvements'],
  };

  return {
    name: 'ielts_writing_assessment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        overallBand: {
          ...BAND_NUMBER_SCHEMA,
          description:
            'Average of the four criteria, rounded to the nearest half band',
        },
        criteria: {
          type: 'object',
          additionalProperties: false,
          properties: {
            [firstLabel]: criterion,
            coherenceCohesion: criterion,
            lexicalResource: criterion,
            grammaticalRange: criterion,
          },
          required: [
            firstLabel,
            'coherenceCohesion',
            'lexicalResource',
            'grammaticalRange',
          ],
        },
        summary: { type: 'string' },
        improvements: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 5,
        },
        correctedExamples: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              original: { type: 'string' },
              suggestion: { type: 'string' },
            },
            required: ['original', 'suggestion'],
          },
        },
        ...(includeRewrite
          ? {
              rewrite: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  focus: {
                    type: 'string',
                    description:
                      'Which paragraph was rewritten and why, in under 15 words',
                  },
                  text: {
                    type: 'string',
                    description:
                      "A band-8-level rewrite of ONE weak paragraph from the candidate's own response, 60-90 words, keeping their ideas",
                  },
                },
                required: ['focus', 'text'],
              },
            }
          : {}),
      },
      required: [
        'overallBand',
        'criteria',
        'summary',
        'improvements',
        'correctedExamples',
        ...(includeRewrite ? ['rewrite'] : []),
      ],
    },
  };
}
