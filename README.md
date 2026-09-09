# Sessioneer
Sessioneer: a system for negotiating and scheduling when sessional staff can and will work

Group Members:
- ANG HUI QI (n11574631)
- CHEAH SHUQI (n12282928)
- TAI JIA YUAN (n11896264)
- PHAN CHEN HUAN (n12167282)
- GAN CHUN YANG (n12086215)

# Sessioneer - Session Management System

## Prerequisites
- Node.js (v14+)
- PostgreSQL (v14+), installed and running locally

## Quick Setup

### 1. Clone and Install
```bash
git clone <repo-url>
cd cap-proj

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Create the Database
Open `psql` (or any Postgres client) and create a user and database:
```sql
CREATE USER sessioneer WITH PASSWORD 'your_password_here';
CREATE DATABASE sessioneer_db OWNER sessioneer;
```

Then load the schema:
```bash
psql -U sessioneer -d sessioneer_db -f backend/setup-db.sql
```
This creates the core tables. A few newer tables/columns (e.g. `unit_memberships`, `session_tutors`, `cover_requests`) aren't in this script — the backend adds them automatically the first time it starts (see step 4).

### 3. Configure Backend
```bash
cd backend
cp .env.example .env
```
Edit `.env` and point `DATABASE_URL` at your local database, e.g.:
```
DATABASE_URL=postgresql://sessioneer:your_password_here@localhost:5432/sessioneer_db
```
(Default local Postgres port is `5432` — change it if your install uses a different one.)

Also set `JWT_SECRET` to any long random string. The `BREVO_API_KEY`, `SUPABASE_*`, and `CRON_SECRET` variables are optional — they're only needed for password-reset emails, file attachment storage, and scheduled reminder jobs. The app runs fine locally with placeholder values for those.

### 4. Run Application

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```
On first run you should see a series of `... schema OK` lines in the console — this is the backend automatically adding any tables/columns not already in `setup-db.sql`. You should also see `Database connected at: <timestamp>`.

**Terminal 2 - Frontend:**
```bash
npm start
```
No frontend configuration is needed for local development — the app automatically talks to `http://localhost:5001` whenever it's running on `localhost`/`127.0.0.1`.

### 5. Access Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5001
- Health Check: http://localhost:5001/health

## Creating an Account
There are no working pre-seeded logins — `setup-db.sql` inserts two sample users (`test1@gmail.com`, `test2@gmail.com`) with a placeholder password hash that can never pass login. Use the **Sign Up** page to create a real Unit Coordinator or Tutor account instead; registered passwords are hashed and verified correctly.

## Troubleshooting

**Port 5432 already in use / can't connect?**
- Check Postgres is actually running: `pg_isready` (or check your OS service manager).
- Confirm the port in `DATABASE_URL` matches what your Postgres instance is listening on.

**Database not connecting?**
- Check the backend console output for `Database connection error:`.
- Double check the username, password, and database name in `DATABASE_URL` match what you created in step 2.

**"Failed to fetch requests"?**
- Make sure the backend is running on port 5001.
- Check `http://localhost:5001/health` returns `"status": "ok"`.

**Login fails for sarah.kim@uni.edu / elaine.lee@student.edu?**
- Expected — see "Creating an Account" above. These accounts have a dummy password hash and cannot log in as shipped.
