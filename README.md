# Sessioneer
Sessioneer: a system for negotiating and scheduling when sessional staff can and will work

Group Members:
- ANG HUI QI (n11574631)
- CHEAH SHUQI (n12282928)
- TAI JIA YUAN (n11896264)
- PHAN CHEN HUAN (n12167282)
- GAN CHUN YANG (n12086215)


cat > README.md << 'EOF'
# Sessioneer - Session Management System

## Prerequisites
- Node.js (v14+)
- Docker Desktop

## Quick Setup (5 minutes!)

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

### 2. Start Database (Docker)
```bash
# Start PostgreSQL in Docker
docker-compose up -d

# Verify it's running
docker-compose ps
```

The database automatically creates all tables and sample data!

### 3. Configure Backend
```bash
cd backend
cp .env.example .env
# No need to edit - default values work!
```

### 4. Run Application

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
npm start
```

### 5. Access Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5001
- Health Check: http://localhost:5001/health

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

**Port 5432 already in use?**
- Stop any local PostgreSQL (Postgres.app, etc.)
- Or change port in `docker-compose.yml`: `"5433:5432"`

**Database not connecting?**
- Check Docker is running: `docker ps`
- Check logs: `docker-compose logs postgres`
- Restart: `docker-compose restart`

**"Failed to fetch requests"?**
- Make sure backend is running on port 5001
- Check `http://localhost:5001/health` shows status "ok"
EOF