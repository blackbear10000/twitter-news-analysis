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
uvicorn app.main:app --reload
```

Environment variables (can be placed in `backend/.env`):

| Variable | Description | Default |
| --- | --- | --- |
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

Set `VITE_API_BASE_URL` in `.env` (defaults to `http://localhost:8000`).

## Docker Compose

Run the full stack with Mongo (two instances), backend, and frontend:

```bash
docker compose up --build
```

Services:

- `mongo-twitter` – stores tweet collections.
- `mongo-biz` – stores business line metadata and admin users.
- `backend` – FastAPI service on `localhost:8000`.
- `frontend` – Vite dev server on `localhost:5173`.

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

