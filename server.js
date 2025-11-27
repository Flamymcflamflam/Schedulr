import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

// serve project Assets (images, etc.) so frontend can reference them at /assets/
app.use('/assets', express.static('Assets'));

// ensure uploads dir exists
fs.mkdirSync("uploads", { recursive: true });

const hasKey = !!process.env.OPENAI_API_KEY;
const openai = hasKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function extractText(filePath, mimetype) {
  if (mimetype === "application/pdf") {
    const data = await fsp.readFile(filePath);
    const parsed = await pdf(data);
    return parsed.text;
  }

  if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filePath.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  const data = await fsp.readFile(filePath, "utf8");
  return data;
}

function toICS(events) {
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ENTI333 Course Scheduler//EN",
  ];

  const body = events.map((e, i) => {
    const dt = (e.date || "").replace(/-/g, "");
    const uid = `event-${i}-${Date.now()}@enti333.local`;
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dt}T000000Z`,
      `DTSTART;VALUE=DATE:${dt}`,
      `SUMMARY:${e.course} - ${e.title}`,
      e.weight ? `DESCRIPTION:Weight ${e.weight}%` : "DESCRIPTION:",
      "END:VEVENT",
    ].join("\n");
  });

  const footer = ["END:VCALENDAR"];
  return [...header, ...body, ...footer].join("\n");
}

const scheduleSchema = {
  name: "course_schedule_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      course_name: { type: "string" },
      source: { type: "string", description: "Optional source filename or document identifier." },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            type: {
              type: "string",
              enum: ["assignment", "quiz", "midterm", "final", "project", "lab", "work", "personal", "other"],
            },
            date: { type: "string", description: "ISO date YYYY-MM-DD. If only month/day given, infer year." },
            time: { type: "string", description: "Optional time like 14:00 or 'in class'." },
            weight: { type: "number", description: "Percent weight if stated." },
            notes: { type: "string" },
            reminders: { type: "array", items: { type: "string", description: "ISO date YYYY-MM-DD for reminder occurrences." } }
          },
          required: ["title", "type", "date", "time", "weight", "notes", "reminders"],
        },
      },
    },
    required: ["course_name", "source", "items"],
  },
};

// --- Heuristic fallback extractor ---
function normalizeDateFromMatch(raw) {
  raw = raw.trim();
  // ISO YYYY-MM-DD
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  // MM/DD/YYYY or M/D/YYYY
  const md = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (md) {
    let [_, m, d, y] = md;
    if (y.length === 2) y = '20' + y;
    return `${y.padStart(4, '0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // Month name variations and ordinal days.
  const months = {
    january:1, jan:1,
    february:2, feb:2,
    march:3, mar:3,
    april:4, apr:4,
    may:5,
    june:6, jun:6,
    july:7, jul:7,
    august:8, aug:8,
    september:9, sept:9, sep:9,
    october:10, oct:10,
    november:11, nov:11,
    december:12, dec:12
  };

  // normalize punctuation, remove trailing commas/periods
  raw = raw.replace(/[\,\.]/g, '').trim();

  // MonthName Day, Year  -> March 3 2026
  const m1 = raw.match(/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|May\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/i);
  if (m1) {
    const mon = String(m1[1]).replace('.', '').toLowerCase();
    const day = m1[2];
    const year = m1[3] || new Date().getFullYear();
    const mnum = months[mon];
    if (!mnum) return null;
    return `${String(year).padStart(4,'0')}-${String(mnum).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // Day MonthName, Year  -> 3 March 2026
  const m2 = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|May\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)(?:\s+(\d{4}))?$/i);
  if (m2) {
    const day = m2[1];
    const mon = String(m2[2]).replace('.', '').toLowerCase();
    const year = m2[3] || new Date().getFullYear();
    const mnum = months[mon];
    if (!mnum) return null;
    return `${String(year).padStart(4,'0')}-${String(mnum).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  return null;
}

function extractScheduleHeuristic(text) {
  // normalize common unicode punctuation to ASCII to improve regex matching
  text = text.replace(/[\u2012\u2013\u2014\u2015]/g, '-'); // various dashes -> -
  text = text.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  text = text.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
  // normalize weird spaces
  text = text.replace(/\u00A0/g, ' ');

    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    console.log('Heuristic: number of raw lines =', rawLines.length);
    console.log(rawLines);
  // further split lines that contain multiple items separated by spaced-dashes, semicolons, or pipes
  // Try to find a course name or code near the top
  function extractCourseName(lines) {
    const top = lines.slice(0, 40).join('\n');
    const p1 = top.match(/Course[:\s]+([A-Z]{2,6}\s?\d{3}\w?)/i);
    if (p1) return p1[1].toUpperCase();
    const p2 = top.match(/([A-Z]{2,6}\s?\d{3}\w?)/);
    if (p2) return p2[1].toUpperCase();
    const p3 = lines.find(l => /course\s*title|course[:\s]/i.test(l));
    if (p3) return p3.replace(/course\s*title[:\s]*|course[:\s]*/i, '').trim();
    return 'Unknown Course';
  }

  const courseName = extractCourseName(rawLines);

  const items = [];

  // For each original line, find dated segments (supports multiple dated items per line)
  const dateGlobal = /(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{2,4})|((January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|May\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s*\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/gi;
  for (const rawLine of rawLines) {
    const line = rawLine;
    console.log('line =>', line, 'matches =>', line.match(dateGlobal));

        // check for explicit month-day ranges like "March 20-22, 2026" or single month-day
        const monthNames = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|May\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sep\\.?|Sept\\.?|Oct\\.?|Nov\\.?|Dec\\.?)';
        const rangeSimple = line.match(new RegExp(`${monthNames}\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–—]\\s*(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s*(\\d{4}))?`, 'i'));
        if (rangeSimple) {
          const month = rangeSimple[1];
          const day1 = rangeSimple[2];
          const day2 = rangeSimple[3];
          const yearPart = rangeSimple[4];
          const chosenDay = day2 || day1;
          const year = yearPart || new Date().getFullYear();
          const dateCandidate = `${month} ${chosenDay}, ${year}`;
          const dateStr = normalizeDateFromMatch(dateCandidate);
          if (dateStr) {
            const weightMatch = line.match(/(\d{1,3})\s?%/);
            const weight = weightMatch ? Number(weightMatch[1]) : null;
            const timeMatch = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
            const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '';
            let title = line.replace(new RegExp(`${month}\\s*${day1}(?:st|nd|rd|th)?(?:\\s*[-–—]\\s*${day2})?(?:,?\\s*${yearPart || ''})?`, 'i'), '').replace(/(\d{1,3}\s?%)/, '').replace(/[-:\t]+/g, ' ').replace(/\b(due date|due on|due)\b[:\s]*/i, '').trim();
            if (!title) title = 'Assessment';
            let type = 'assignment';
            if (/final/i.test(line)) type = 'final';
            else if (/midterm/i.test(line)) type = 'midterm';
            else if (/quiz/i.test(line)) type = 'quiz';
            else if (/lab/i.test(line)) type = 'lab';
            else if (/project/i.test(line)) type = 'project';
            else if (/work|shift|schedule/i.test(line)) type = 'work';
            console.log('Heuristic push (rangeSimple):', { title, type, date: dateStr, time, weight });
            items.push({ title, type, date: dateStr, time, weight, notes: '' });
          }
          continue;
        }

    // find all date-like matches in the line (safer using match() to get all matches)
    const mmatches = line.match(dateGlobal) || [];
    for (const rawMatch of mmatches) {
      const dateStr = normalizeDateFromMatch(rawMatch);
      console.log('rawMatch:', rawMatch, 'normalized:', dateStr);
      if (!dateStr) continue;

      const weightMatch = line.match(/(\d{1,3})\s?%/);
      const weight = weightMatch ? Number(weightMatch[1]) : null;
      const timeMatch = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '';

      // build title from the whole line but remove the matched date and weight
      let title = line.replace(rawMatch, '').replace(/(\d{1,3}\s?%)/, '').replace(/[-:\t]+/g, ' ').replace(/\b(due date|due on|due)\b[:\s]*/i, '').trim();
      if (!title) title = 'Assessment';

      let type = 'assignment';
      if (/final/i.test(line)) type = 'final';
      else if (/midterm/i.test(line)) type = 'midterm';
      else if (/quiz/i.test(line)) type = 'quiz';
      else if (/lab/i.test(line)) type = 'lab';
      else if (/project/i.test(line)) type = 'project';
      else if (/work|shift|schedule/i.test(line)) type = 'work';

      console.log('Heuristic push (match):', { title, type, date: dateStr, time, weight });
      items.push({ title, type, date: dateStr, time, weight, notes: '' });
    }
  }

  return { course_name: courseName, term: '', items };
}

async function extractScheduleWithAI(text) {
  if (!openai) {
    return extractScheduleHeuristic(text);
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "You are an assistant that extracts calendar events from one or more documents. " +
            "Return ONLY valid JSON that strictly follows the provided JSON schema. Do not include any explanatory text."
        },
        {
          role: "user",
          content:
            "Imagine you are a university student building a semester schedule. " +
            "Using ALL of the provided documents, find every dated item (assignments, quizzes, midterms, finals, projects, labs), and also include non-school dated items like work schedules or personal events. " +
            "For each item return: title, type (assignment/quiz/midterm/final/project/lab/work/personal/other), date as YYYY-MM-DD, optional time, weight in percent if stated, and notes. " +
            "When a date is given as a range, use the latest date in the range as the due date. If a year is missing, infer the most likely year for the semester (prefer the upcoming year/term). " +
            "Additionally, for each item compute reminders exactly 7, 5, and 3 days before the due date and include them as ISO dates in the 'reminders' array (omit reminders that would fall before year 1900). " +
            "Make sure to use all documents to find all tests and assignments. If a document is not a course outline (for example a work schedule), include those dated events as type 'work' or 'personal' as appropriate. " +
            "If you cannot find a course name for an item, set course_name to 'Unknown Course'. Return one JSON object per document with 'course_name' and 'items'. The 'items' array may be empty if no dated items are found.\n\n" +
            text
        }
      ],
      text: { format: { type: "json_schema", name: scheduleSchema.name || 'extraction', schema: scheduleSchema.schema } }
    });

    // The Responses API may or may not populate `output_parsed`. If missing, attempt
    // to extract JSON text from the response output and parse it.
    if (response.output_parsed) return response.output_parsed;

    // gather output_text blocks
    const textBlocks = [];
    for (const item of response.output || []) {
      for (const c of item.content || []) {
        if (c.type === 'output_text' && typeof c.text === 'string') textBlocks.push(c.text);
      }
    }

    if (textBlocks.length) {
      const joined = textBlocks.join('\n');
      try {
        const parsed = JSON.parse(joined);
        console.log('OpenAI parsed JSON (via text blocks)');
        return parsed;
      } catch (e) {
        // try to extract JSON substring
        const jstart = joined.indexOf('{');
        const jend = joined.lastIndexOf('}');
        if (jstart !== -1 && jend !== -1 && jend > jstart) {
          const substr = joined.slice(jstart, jend + 1);
          try {
            const parsed = JSON.parse(substr);
            console.log('OpenAI parsed JSON (via substring)');
            return parsed;
          } catch (e2) {
            console.warn('Failed to parse JSON from OpenAI text output');
          }
        }
      }
    }

    return extractScheduleHeuristic(text);
  } catch (err) {
    console.error('OpenAI error, falling back to heuristic:', err?.message);
    return extractScheduleHeuristic(text);
  }
}

app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "No files uploaded." });

    const allEvents = [];
    const perCourse = [];

    for (const f of files) {
      const text = await extractText(f.path, f.mimetype);
      const extracted = await extractScheduleWithAI(text);

      perCourse.push(extracted);

      for (const item of extracted.items) {
        allEvents.push({
          course: extracted.course_name,
          title: item.title,
          type: item.type,
          date: item.date,
          time: item.time || "",
          weight: item.weight ?? null,
          notes: item.notes || "",
        });
      }

      try { await fsp.unlink(f.path); } catch {}
    }

    allEvents.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    res.json({ courses: perCourse, events: allEvents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process outlines.", details: err.message });
  }
});

app.post("/api/ics", express.json(), (req, res) => {
  const { events } = req.body;
  if (!events?.length) return res.status(400).send("No events.");

  const ics = toICS(events);
  res.setHeader("Content-Type", "text/calendar");
  res.setHeader("Content-Disposition", "attachment; filename=schedule.ics");
  res.send(ics);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!openai) console.log('OPENAI_API_KEY not set — using heuristic extractor.');
});
