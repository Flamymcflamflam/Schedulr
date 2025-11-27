import fs from 'fs/promises';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY not set in .env');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: key });

async function main() {
  const text = await fs.readFile('public/samples/sample1.txt', 'utf8');

  const scheduleSchema = {
    name: 'course_schedule_extraction',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        course_name: { type: 'string' },
        source: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              type: { type: 'string' },
              date: { type: 'string' },
              time: { type: 'string' },
              weight: { type: 'number' },
              notes: { type: 'string' },
              reminders: { type: 'array', items: { type: 'string' } }
            },
            required: ['title', 'type', 'date', 'time', 'weight', 'notes', 'reminders']
          }
        }
      },
      required: ['course_name', 'source', 'items']
    }
  };

  try {
    const resp = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: 'You are an assistant that extracts calendar events from documents. Return ONLY valid JSON matching the provided json_schema.'
        },
        {
          role: 'user',
          content: 'Extract all dated items (assignments, tests, projects, work, personal). For ranges pick the latest date. Include reminders 7,5,3 days before. Return one JSON per document.\n\n' + text
        }
      ],
      text: {
        format: { type: 'json_schema', name: scheduleSchema.name || 'extraction', schema: scheduleSchema.schema }
      }
    });

    console.log('Parsed output (if any):');
    console.log(JSON.stringify(resp.output_parsed || resp.output, null, 2));
  } catch (err) {
    console.error('OpenAI request failed:', err);
    process.exit(1);
  }
}

main();
