# Course Outline → Schedule

An AI-powered web application that extracts assignment due dates, test dates, and other important events from course outlines and automatically generates a calendar schedule for your Outlook calendar.

## Features

- **Document Upload**: Upload course outlines in PDF, DOCX, or TXT format
- **AI-Powered Extraction**: Uses OpenAI API (with heuristic fallback) to intelligently extract:
  - Assignment deadlines
  - Quiz and midterm dates
  - Final exam dates
  - Project due dates
  - Work schedules and personal events
- **Date Normalization**: Automatically parses various date formats (ISO, MM/DD/YYYY, month names, etc.)
- **Calendar Export**: Download schedule as `.ics` file for direct import into Outlook or other calendar apps
- **Reminder Generation**: Automatically creates reminders 7, 5, and 3 days before each event
- **Beautiful UI**: Modern, responsive interface with background image and readable text overlay
- **Multiple Event Types**: Distinguishes between assignment, quiz, midterm, final, project, lab, work, and personal events

## Prerequisites

- **Node.js** (v14 or later)
- **npm** (comes with Node.js)
- **OpenAI API Key** (optional; app falls back to heuristic parsing if unavailable)

## Installation

1. Clone or navigate to the project directory:
   ```bash
   cd "Planner App"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the project root and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-api-key-here
   ```
   (If you don't have an API key, the app will use a built-in heuristic parser — it will still work but with less accuracy.)

## Running the Application

Start the server:
```bash
npm start
```

Or, for development with auto-restart on file changes:
```bash
npm run dev
```

The server will start on **http://localhost:3000**

Open your browser and navigate to http://localhost:3000 to use the app.

## Usage

### Step 1: Upload Course Outlines
1. Click the file input or "Create Schedule" button
2. Select one or more PDF, DOCX, or TXT files containing your course outlines
3. Click "Create Schedule"

### Step 2: Review Extracted Events
The app will display a table with all extracted events, including:
- **Date**: When the assignment/test is due
- **Course**: The course code (e.g., ENTI 333)
- **Item**: Name of the assignment/test
- **Type**: Category (assignment, quiz, midterm, final, project, lab, work, personal)
- **Weight**: Percentage weight (if applicable)
- **Notes**: Additional details

### Step 3: Download & Import Calendar
1. Click "Download .ics" to save the calendar file
2. Open the downloaded `.ics` file
3. Outlook will prompt you to import events
4. Select your calendar and click "Import"
5. All events now appear in your Outlook calendar with automatic reminders!

## Project Structure

```
Planner App/
├── server.js              # Main Express server with file upload & AI extraction
├── package.json           # Node.js dependencies
├── .env                   # Environment variables (API key) - add manually
├── .gitignore             # Git ignore rules (includes .env)
├── README.md              # This file
├── public/                # Static frontend files
│   ├── index.html         # Main page UI
│   ├── app.js             # Client-side JavaScript
│   ├── styles.css         # Styling with background image
│   └── samples/
│       └── sample1.txt    # Example course outline for testing
├── scripts/               # Utility scripts
│   ├── upload-sample.js   # Test uploader
│   └── run-openai.js      # Direct OpenAI API test
├── Assets/
│   └── Images/
│       └── Background.jpg # Site background image
└── uploads/               # Temporary upload directory (auto-cleaned)
```

## How It Works

### Extraction Pipeline

1. **File Upload**: User uploads a document (PDF/DOCX/TXT)
2. **Text Extraction**: 
   - PDFs → extracted via `pdf-parse`
   - DOCX → extracted via `mammoth`
   - TXT → read as plain text
3. **Event Extraction**:
   - **With OpenAI API** (recommended): Uses GPT-4o-mini with JSON schema to extract structured event data including reminders
   - **Heuristic Fallback**: If API unavailable or fails, uses regex-based parsing to find dates and event keywords
4. **Date Normalization**: Converts various date formats to ISO (YYYY-MM-DD)
5. **Reminder Generation**: Creates reminder dates 7, 5, and 3 days before each event
6. **Calendar Export**: Generates `.ics` (iCalendar) file compatible with Outlook

### JSON Schema

Events are structured as:
```json
{
  "course_name": "ENTI 333",
  "items": [
    {
      "title": "Assignment 1",
      "type": "assignment",
      "date": "2026-03-03",
      "time": "14:00",
      "weight": 10,
      "notes": "",
      "reminders": ["2026-02-24", "2026-02-28", "2026-03-01"]
    }
  ]
}
```

## Environment Variables

Create a `.env` file in the project root:

```env
# Required for AI extraction (optional if using heuristic fallback)
OPENAI_API_KEY=sk-your-openai-api-key

# Optional: change port (default: 3000)
PORT=3000
```

## API Endpoints

### `POST /api/upload`
Upload course outline file(s) and extract events.

**Request**: Multipart form data with `files` field containing one or more files

**Response**: JSON with extracted courses and events
```json
{
  "courses": [...],
  "events": [...]
}
```

### `POST /api/ics`
Generate `.ics` calendar file from events.

**Request**: JSON body with `events` array

**Response**: iCalendar file (text/calendar)

## Testing

### Test with Sample File
```bash
node scripts/upload-sample.js
```
This uploads `public/samples/sample1.txt` and prints the extracted events.

### Test OpenAI Extraction Directly
```bash
node scripts/run-openai.js
```
This tests the AI extraction with the sample file and shows parsed JSON output.

## Supported File Formats

- **PDF** (.pdf) — any PDF document
- **Word** (.docx) — Microsoft Word documents
- **Text** (.txt) — plain text files with course outlines

## Troubleshooting

### Port 3000 Already in Use
If you get "address already in use :::3000":
```bash
# Kill the process on port 3000
netstat -ano | findstr :3000
taskkill /PID <process-id> /F
```

### OpenAI API Errors
- Verify your API key is correct in `.env`
- Check your OpenAI account has credits/quota
- The app will automatically fall back to heuristic parsing if API fails

### Missing Dependencies
```bash
npm install
```

### No Events Extracted
- Ensure the uploaded file contains dates in recognizable formats
- Try a different file format (PDF → DOCX → TXT)
- Check the server logs for parsing details

## Dependencies

- **express** — Web framework
- **multer** — File upload handling
- **pdf-parse** — PDF text extraction
- **mammoth** — DOCX text extraction
- **openai** — OpenAI API client
- **dotenv** — Environment variable loading

## Future Enhancements

- Support for more calendar formats (Google Calendar, iCloud, etc.)
- Bulk upload of multiple files
- User accounts and calendar sync
- Recurring event support
- Mobile app version
- Better heuristic parsing for diverse course outline formats

## License

This project is provided as-is for educational purposes.

## Support

For issues or questions, check the logs in the server terminal or open the browser developer console (F12) to see client-side errors.

## Credits

Built with:
- OpenAI GPT-4o-mini for intelligent event extraction
- Node.js and Express for backend
- Vanilla JavaScript for frontend

---

**Happy scheduling!** 📅
