# Twitter News Analysis Platform

A FastAPI + React system that ingests Twitter data from MongoDB, lets admins manage business lines (collections of Twitter user IDs), and builds topic & key-person visualizations using LLM-based analysis. The platform supports both private admin management and public visualization of historical analysis snapshots.

## Architecture

- **Backend**: FastAPI, Motor, JWT authentication, analytics endpoints, seeded admin user.
- **Frontend**: React + Vite + TypeScript, Zustand for auth state, React Query for data fetching, D3 visual graph components.
- **Datastores**:
  - `twitter_data` (existing) – one collection per Twitter user.
  - `biz_meta` – new database storing business lines, their members, and admin users.

## Prerequisites

- Python 3.11+
- Node.js 18.x (Vite build targets Node 18; higher versions also work)
- MongoDB 6.x

## Backend setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Or using uvicorn directly (port will default to 8000):
```bash
uvicorn app.main:app --reload
```

To use a custom port with uvicorn:
```bash
uvicorn app.main:app --reload --port 9000
```

Environment variables (can be placed in `backend/.env`):

| Variable | Description | Default |
| --- | --- | --- |
| `SERVER_PORT` | Backend server port | `8000` |
| `SERVER_HOST` | Backend server host | `0.0.0.0` |
| `SECRET_KEY` | JWT signing secret | `change-me-secret` |
| `MONGO_TWITTER_URI` | Connection string for tweet DB | `mongodb://localhost:27017` |
| `MONGO_TWITTER_DB` | Tweet database name | `twitter_data` |
| `MONGO_BIZ_URI` | Connection string for metadata DB | `mongodb://localhost:27017` |
| `MONGO_BIZ_DB` | Metadata database name | `biz_meta` |
| `DEFAULT_ADMIN_USERNAME` | Seed admin username | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | Seed admin password | `ChangeMe123!` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT lifetime | `720` |
| `LLM_PROVIDER` | LLM provider: `openai`, `deepseek`, or `gemini` | `openai` |
| `OPENAI_API_KEY` | OpenAI API key | (required if using OpenAI) |
| `OPENAI_MODEL` | OpenAI model name | `gpt-4o-mini` |
| `DEEPSEEK_API_KEY` | Deepseek API key | (required if using Deepseek) |
| `DEEPSEEK_MODEL` | Deepseek model name | `deepseek-chat` |
| `DEEPSEEK_BASE_URL` | Deepseek API base URL | `https://api.deepseek.com` |
| `GEMINI_API_KEY` | Google Gemini API key | (required if using Gemini) |
| `GEMINI_MODEL` | Gemini model name | `gemini-pro` |

Run tests (disable third-party pytest plugins to avoid host conflicts):

```bash
cd backend
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Environment variables (can be placed in `frontend/.env`):

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` or `VITE_PORT` | Frontend dev server port | `5173` |
| `VITE_HOST` | Frontend dev server host | `localhost` |
| `VITE_PREVIEW_PORT` | Frontend preview server port | `4173` |
| `VITE_PREVIEW_HOST` | Frontend preview server host | `localhost` |
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:8000` |
| `VITE_ALLOWED_HOSTS` | Comma-separated list of hostnames allowed to access the dev server (e.g. `yourdomain.com,localhost`) | _(empty)_ |

**Note**: Vite recognizes `PORT` environment variable by default. You can use either `PORT` or `VITE_PORT` to configure the dev server port.

### Running the frontend with PM2

When running the dev server under PM2, start the Vite binary directly so that PM2 manages the actual process (otherwise the spawned `node_modules/.bin/vite` process can outlive PM2):

```bash
cd frontend
PORT=6000 pm2 start ./node_modules/vite/bin/vite.js --name frontend-dev -- \
  --host 0.0.0.0 --port ${PORT}

# allow custom hostnames (e.g. yourdomain.com)
PORT=6000 VITE_ALLOWED_HOSTS="yourdomain.com,localhost" pm2 restart frontend-dev
```

Stopping the PM2 process will now terminate the Vite server cleanly.  
Because `strictPort` is enabled in `vite.config.ts`, Vite will exit with an error if the chosen port is already occupied, helping you detect orphaned processes quickly.

## Docker Compose

Run the full stack with Mongo (two instances), backend, and frontend:

```bash
docker compose up --build
```

You can customize ports by setting environment variables before running docker compose:

```bash
# Example: Change backend port to 9000 and frontend port to 6000
export SERVER_PORT=9000
export VITE_PORT=6000
docker compose up --build
```

Or create a `.env` file in the project root:

```env
SERVER_PORT=9000
VITE_PORT=6000
```

Services:

- `mongo-twitter` – stores tweet collections (port 27017).
- `mongo-biz` – stores business line metadata and admin users (port 27018).
- `backend` – FastAPI service (default: `localhost:8000`, configurable via `SERVER_PORT`).
- `frontend` – Vite dev server (default: `localhost:5173`, configurable via `VITE_PORT`).

## Key API Endpoints

### Admin Endpoints (require authentication)

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/token` | Obtain JWT |
| `GET` | `/api/biz/` | List business lines |
| `POST` | `/api/biz/` | Create a business line with members |
| `PUT` | `/api/biz/{id}` | Update metadata or member IDs |
| `DELETE` | `/api/biz/{id}` | Delete a business line |
| `GET` | `/api/biz/{id}/members` | List members for a business line |
| `POST` | `/api/biz/{id}/members` | Add a new member with description |
| `PUT` | `/api/biz/members/{id}` | Update member description |
| `DELETE` | `/api/biz/members/{id}` | Delete a member |
| `GET` | `/api/tweets/` | Fetch 24h tweets for selected business line |
| `GET` | `/api/tweets/user/{twitter_id}` | Fetch tweets for a specific user |
| `POST` | `/api/tweets/backfill/{id}` | Tag historical tweets with the line name |
| `GET` | `/api/insights/` | Get real-time insights (with optional LLM) |
| `POST` | `/api/insights/generate/{id}` | Trigger analysis and save as snapshot |

### Public Endpoints (no authentication)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/public/insights/snapshots` | List historical analysis snapshots |
| `GET` | `/api/public/insights/snapshots/{id}` | Get a specific snapshot |
| `GET` | `/api/public/insights/snapshots/latest` | Get the latest snapshot |

## Frontend Highlights

### Admin Interface (`/`)

- **Business Line Management**: Create, update, and delete business lines
- **Member Management**: 
  - Add Twitter users to business lines
  - Add descriptions for each user (used as LLM context)
  - Edit and delete members
- **User Timeline View**: View recent tweets for a selected user
- **Analysis Trigger**: Generate and save analysis snapshots (not displayed in admin UI)

### Public Visualization (`/public.html` or separate route)

- **Historical Analysis**: Browse and view saved analysis snapshots
- **Date Selection**: Filter snapshots by date and business line
- **Interactive Graphs**: D3 force-directed graphs showing topics and key persons
- **Topic & Key Person Views**: Detailed breakdowns of analysis results

## LLM Configuration

The platform supports multiple LLM providers for analysis:

### OpenAI
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o-mini
```

### Deepseek
```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-api-key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### Google Gemini
```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-pro
```

## LLM Analysis Prompts

The system uses carefully designed prompts for analysis:

1. **Topic Analysis**: Identifies key topics, themes, and trends from tweets, considering member descriptions for context
2. **Key Person Analysis**: Identifies important users and their relationships based on mentions, replies, retweets, and content themes

If LLM analysis fails, the system falls back to simple keyword-based extraction.

## Data Model

### Business Lines (`biz_lines` collection)
- `name`: Business line name
- `description`: Optional description
- `created_at`, `updated_at`: Timestamps

### Members (`biz_members` collection)
- `business_line_id`: Reference to business line
- `twitter_id`: Twitter username/ID
- `description`: Optional description for LLM context
- `created_at`, `updated_at`: Timestamps

### Insight Snapshots (`biz_insight_snapshots` collection)
- `business_line_id`: Reference to business line
- `analysis_date`: Date of analysis
- `topics`: Array of topic summaries
- `nodes`: Graph nodes (users and topics)
- `edges`: Graph edges (relationships)
- `raw_data_summary`: Optional summary text
- `created_at`: Timestamp

