# Sessioneer
Sessioneer: a system for negotiating and scheduling when sessional staff can and will work

Group Members:
- ANG HUI QI (n11574631)
- CHEAH SHUQI (n12282928)
- TAI JIA YUAN (n11896264)
- PHAN CHEN HUAN (n12167282)
- GAN CHUN YANG (n12086215)


# Sessioneer - Session Management System

## Installation

### Prerequisites
Make sure you have the following installed before you start:
- [Node.js](https://nodejs.org/) v14 or later (includes npm)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running, before you get to step 2)
- [Git](https://git-scm.com/)

### 1. Clone the repository
```bash
git clone <repo-url>
cd cap-proj
```

### 2. Install dependencies
Install the frontend dependencies from the project root, then the backend dependencies:
```bash
# Frontend (run from the project root)
npm install

# Backend
cd backend
npm install
cd ..
```

### 3. Start the database (Docker)
Sessioneer uses PostgreSQL, run via Docker Compose. From the project root:
```bash
docker-compose up -d
```
This pulls the `postgres:14` image, starts a container named `sessioneer_postgres`, and automatically runs `backend/setup-db.sql` on first start to create all tables and seed sample data.

Confirm the container is healthy before continuing:
```bash
docker-compose ps
```
You should see `sessioneer_postgres` listed with status `healthy`.

### 4. Configure the backend
```bash
cd backend
cp .env.example .env
cd ..
```
The default `.env` values work out of the box for local development (the database URL already matches the port Docker Compose exposes). You only need to edit `.env` if you want to enable optional features:
- `BREVO_API_KEY` / `EMAIL_FROM` — for password reset emails
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — for message/file attachments and avatars
- `JWT_SECRET` / `CRON_SECRET` — replace with your own long random strings, especially outside local development

### 5. Run the application
Start the backend and frontend in two separate terminals:

**Terminal 1 — Backend**
```bash
cd backend
npm start
```

**Terminal 2 — Frontend**
```bash
npm start
```

### 6. Access the application
| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5001 |
| Health check | http://localhost:5001/health |

If the health check returns `{"status":"ok"}`, the backend is correctly connected to the database.

## Useful Docker Commands

```bash
# Stop database
docker-compose down

# Start database
docker-compose up -d

# View logs
docker-compose logs -f

# Reset database (deletes all data!)
docker-compose down -v
docker-compose up -d

# Connect to database
docker exec -it sessioneer_postgres psql -U sessioneer -d sessioneer_db
```

## Test Accounts
- **Unit Coordinator:** sarah.kim@uni.edu
- **Tutor:** elaine.lee@student.edu

## Troubleshooting

**Port 5433 already in use?**
- Stop any local PostgreSQL instance using that port, or
- Change the host port in `docker-compose.yml` (e.g. `"5434:5432"`) and update `DATABASE_URL` in `backend/.env` to match.

**Database not connecting?**
- Check Docker is running: `docker ps`
- Check logs: `docker-compose logs postgres`
- Restart: `docker-compose restart`

**"Failed to fetch requests"?**
- Make sure the backend is running on port 5001
- Check `http://localhost:5001/health` shows status `ok`

**Port 3000 or 5001 already in use?**
- Stop whatever else is using the port, or set `PORT` in `backend/.env` (backend) or run the frontend with `PORT=3001 npm start` (frontend).

**`npm install` fails or the app won't start?**
- Confirm your Node.js version with `node -v` (v14+ required)
- Delete `node_modules` and `package-lock.json` in the affected folder (root or `backend`) and re-run `npm install`
