# Visa Form Checker

A local-first tool that extracts passport data via MRZ (Machine Readable Zone) OCR and cross-checks it against visa application forms in your browser. Built as a Chrome extension + Python backend.

## What It Does

1. **Upload a passport image or PDF** — extracts name, passport number, DOB, nationality, expiry date, etc. from the MRZ zone using OCR
2. **Save as a profile** — store extracted data locally for reuse
3. **Navigate to any visa application form** — click "Check This Page" in the extension popup
4. **Instant verification** — highlights matching fields in green and mismatches in red directly on the page

The comparison engine handles:
- Multiple date formats (DD/MM/YYYY, YYYY-MM-DD, etc.)
- Nationality codes vs full country names (IND = INDIAN = India)
- Gender abbreviations (M = MALE)
- Fuzzy name matching (handles typos, subset matching like "ADITYA" in "ADITYA MOHAN")
- Custom aliases for alternate spellings

All data stays on your machine. Nothing is sent to external servers.

## Architecture

```
visa-form-checker/
├── backend/              # Python FastAPI server
│   ├── src/visa_checker/
│   │   ├── main.py           # Entry point (uvicorn on port 5050)
│   │   ├── config.py         # Auth token & paths (~/.visa-checker/)
│   │   ├── database.py       # SQLite setup & connection
│   │   ├── models.py         # Pydantic models
│   │   ├── db/schema.sql     # Database schema
│   │   ├── routers/
│   │   │   ├── ocr.py        # POST /api/v1/ocr/extract
│   │   │   ├── profiles.py   # CRUD for passport profiles
│   │   │   └── compare.py    # POST /api/v1/compare
│   │   └── services/
│   │       ├── mrz_service.py     # MRZ extraction + image preprocessing
│   │       ├── compare_service.py # Field comparison logic
│   │       └── nationality.py     # ISO 3166-1 nationality mapping
│   └── pyproject.toml
├── extension/            # Chrome extension (Manifest v3)
│   ├── manifest.json
│   ├── popup.html/js         # Extension popup UI
│   ├── options.html/js       # Settings, upload, profile management
│   ├── background.js         # Service worker (API bridge)
│   ├── content.js/css        # Form field extraction & highlighting
│   └── adapters/generic.js   # Heuristic form field detector
├── test-site/            # Sample visa form for testing
│   └── index.html
└── scripts/
    └── start.sh          # One-command backend startup (macOS/Linux)
    └── start.bat         # One-command backend startup (Windows)
```

## Prerequisites

- **Python 3.11+**
- **Tesseract OCR** with the `mrz` trained data
- **Google Chrome** (or Chromium-based browser)

## Setup

### 1. Install Tesseract OCR

**macOS:**
```bash
brew install tesseract
```

**Ubuntu/Debian:**
```bash
sudo apt-get install tesseract-ocr
```

**Windows:**
Download and run the installer from the [UB-Mannheim Tesseract releases page](https://github.com/UB-Mannheim/tesseract/wiki). During installation:
- Note the install path (default: `C:\Program Files\Tesseract-OCR\`)
- Check **"Add to PATH"** so Tesseract is available system-wide

After installation, verify it works:
```cmd
tesseract --version
```

If the command isn't found, add the install directory to your PATH manually:
1. Open **System Properties** → **Advanced** → **Environment Variables**
2. Under **System variables**, find `Path` and click **Edit**
3. Add `C:\Program Files\Tesseract-OCR\` (or your install path)

---

### 2. Download MRZ trained data for Tesseract

Tesseract needs a special `mrz` language model to read the MRZ zone on passports.

**macOS (Homebrew):**
```bash
curl -L -o /opt/homebrew/share/tessdata/mrz.traineddata \
  https://github.com/DoubangoTelecom/tesseractMRZ/raw/master/tessdata_best/mrz.traineddata
```

**Linux (typical path):**
```bash
curl -L -o /usr/share/tesseract-ocr/5/tessdata/mrz.traineddata \
  https://github.com/DoubangoTelecom/tesseractMRZ/raw/master/tessdata_best/mrz.traineddata
```

**Windows:**
Download the file directly:
```
https://github.com/DoubangoTelecom/tesseractMRZ/raw/master/tessdata_best/mrz.traineddata
```
Then move it to the `tessdata` folder inside your Tesseract install directory, e.g.:
```
C:\Program Files\Tesseract-OCR\tessdata\mrz.traineddata
```

If you're unsure of your tessdata path, check:
```bash
# macOS/Linux
tesseract --print-parameters 2>/dev/null | grep tessdata
# or check: /usr/local/share/tessdata/, /usr/share/tessdata/

# Windows
tesseract --print-parameters 2>NUL | findstr tessdata
```

---

### 3. Start the backend

**macOS/Linux:**
```bash
# Option A: Use the startup script (creates venv + installs deps automatically)
./scripts/start.sh

# Option B: Manual setup
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m visa_checker.main
```

**Windows:**
```cmd
# Option A: Use the startup script
scripts\start.bat

# Option B: Manual setup
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
python -m visa_checker.main
```

> **Windows note:** If you see a `pip install` error related to `opencv-python`, make sure you have the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) installed, or try installing the headless variant instead:
> ```cmd
> pip install opencv-python-headless
> ```

On first run (all platforms), the backend will:
- Create `~/.visa-checker/` directory (`C:\Users\<you>\.visa-checker\` on Windows)
- Generate an auth token at `~/.visa-checker/auth_token`
- Initialize the SQLite database at `~/.visa-checker/profiles.db`
- Print the auth token to the terminal

The server starts at `http://127.0.0.1:5050`. API docs are available at `http://127.0.0.1:5050/docs`.

---

### 4. Load the Chrome extension

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` directory from this repo

### 5. Configure the extension

1. Click the Visa Form Checker extension icon in Chrome
2. Click **Settings** (or right-click icon > Options)
3. Paste the auth token from step 3 (find it in the terminal output or at `~/.visa-checker/auth_token`)
4. Click **Save Token**

## Usage

### Upload a passport

1. Go to the extension **Settings** page
2. Click or drag a passport image (JPG, PNG) or scanned PDF into the upload area
3. Review the extracted fields (surname, given names, passport number, DOB, etc.)
4. Edit any incorrectly extracted fields if needed
5. Click **Save as Profile**

The tool handles real-world photos — it tries multiple image preprocessing techniques (contrast enhancement, rotation, adaptive thresholding) to detect the MRZ zone.

### Check a visa form

1. Navigate to any visa application website
2. Click the extension icon in the toolbar
3. Select a saved profile from the dropdown
4. Click **Check This Page**

The extension will:
- Extract all form fields from the page
- Compare them against your selected profile
- Highlight matches (green) and mismatches (red/yellow) directly on the page
- Show a summary in the popup

### Manage profiles

On the Settings page, scroll down to **Saved Profiles** to:
- View all saved profiles and their details
- Edit any field
- Delete profiles you no longer need

## API Endpoints

All endpoints require `Authorization: Bearer <token>` header (except `/health`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Server status (no auth) |
| POST | `/api/v1/ocr/extract` | Upload image/PDF, extract MRZ |
| GET | `/api/v1/profiles` | List all profiles |
| POST | `/api/v1/profiles` | Create new profile |
| GET | `/api/v1/profiles/:id` | Get profile details |
| PUT | `/api/v1/profiles/:id` | Update profile |
| DELETE | `/api/v1/profiles/:id` | Delete profile |
| POST | `/api/v1/profiles/:id/aliases` | Add field alias |
| DELETE | `/api/v1/profiles/:id/aliases/:aid` | Remove alias |
| POST | `/api/v1/compare` | Compare form fields against a profile |

## Test Site

A sample Singapore visa application form is included for testing:

**macOS/Linux:**
```bash
cd test-site
python3 -m http.server 8080
```

**Windows:**
```cmd
cd test-site
python -m http.server 8080
```

Then open `http://localhost:8080` and use the extension to check the page.

## Tech Stack

- **Backend**: Python, FastAPI, SQLite, Tesseract OCR, FastMRZ, OpenCV
- **Extension**: Chrome Manifest v3, vanilla JS
- **OCR**: FastMRZ (neural network MRZ segmentation + Tesseract)

## Troubleshooting

**"Error opening data file mrz.traineddata"**
Tesseract can't find the MRZ language data. See step 2 above to download it. On Windows, make sure the file is in `C:\Program Files\Tesseract-OCR\tessdata\`.

**"No MRZ detected in image"**
The MRZ zone couldn't be found. Try:
- A flatter, well-lit photo
- A scanned PDF instead of a phone photo
- Ensure the MRZ lines (the `P<IND...` text at the bottom) are clearly visible

**Extension can't connect to backend**
- Make sure the backend is running (`./scripts/start.sh` on macOS/Linux, `scripts\start.bat` on Windows)
- Check the auth token matches what's in `~/.visa-checker/auth_token`
- Backend must be on `http://127.0.0.1:5050`

**Windows: `start.bat` opens and closes immediately**
Run the script from a Command Prompt or PowerShell window so you can see error output:
```cmd
cd path\to\visa-form-checker
scripts\start.bat
```

**Windows: `python` not found**
Make sure Python 3.11+ is installed and added to PATH. Download from [python.org](https://www.python.org/downloads/). During installation, check **"Add Python to PATH"**.

**Windows: OpenCV install fails**
Try the headless variant:
```cmd
pip install opencv-python-headless
```

**Form fields not detected on a website**
The generic form field detector uses label heuristics. It works best with standard HTML forms. Dynamic SPAs with custom components may not be fully supported.

## License

MIT
