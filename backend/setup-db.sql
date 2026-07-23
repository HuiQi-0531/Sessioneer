-- Database setup script for Sessioneer
-- Run this after creating the sessioneer_db database

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    school_id VARCHAR(50),
    phone_number VARCHAR(20),
    work_experience TEXT,
    maximum_hours INTEGER,
    contract_type VARCHAR(50),
    application_status VARCHAR(50),
    applied_at TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Units table
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_coordinator_id UUID REFERENCES users(id),
    unit_code VARCHAR(20) NOT NULL,
    unit_name VARCHAR(255) NOT NULL,
    semester VARCHAR(20) NOT NULL,
    year INTEGER NOT NULL,
    availability_deadline TIMESTAMP,
    availability_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id),
    day VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(100),
    session_type VARCHAR(50),
    capacity INTEGER,
    is_assigned BOOLEAN DEFAULT FALSE,
    assigned_tutor_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Availability table
CREATE TABLE IF NOT EXISTS availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id UUID REFERENCES users(id),
    unit_id UUID REFERENCES units(id),
    day VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    preference VARCHAR(50),
    is_submitted BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Change requests table
CREATE TABLE IF NOT EXISTS change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id UUID REFERENCES users(id),
    session_id UUID REFERENCES sessions(id),
    unit_id UUID REFERENCES units(id),
    request_type VARCHAR(50),
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_by_id UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Swap requests table
CREATE TABLE IF NOT EXISTS swap_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requesting_tutor_id UUID REFERENCES users(id),
    target_tutor_id UUID REFERENCES users(id),
    current_session_id UUID REFERENCES sessions(id),
    preferred_session_id UUID REFERENCES sessions(id),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_by_id UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    swapped_with_tutor_id UUID REFERENCES users(id),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Session assignments table
CREATE TABLE IF NOT EXISTS session_assign (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    tutor_id UUID REFERENCES users(id),
    unit_id UUID REFERENCES units(id),
    is_draft BOOLEAN DEFAULT TRUE,
    status VARCHAR(50),
    tutor_notes TEXT,
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by_id UUID REFERENCES users(id),
    responded_at TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    notification_type VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    related_unit_id UUID REFERENCES units(id),
    related_session_id UUID REFERENCES sessions(id),
    action_url VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id),
    recipient_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    sent_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_change_requests_tutor ON change_requests(tutor_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status);
CREATE INDEX IF NOT EXISTS idx_sessions_unit ON sessions(unit_id);
CREATE INDEX IF NOT EXISTS idx_sessions_assigned_tutor ON sessions(assigned_tutor_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);

-- Insert sample data
INSERT INTO users (email, password_hash, role, name) VALUES
('sarah.kim@uni.edu', '$2a$10$dummy_hash', 'coordinator', 'Dr. Sarah Kim'),
('elaine.lee@student.edu', '$2a$10$dummy_hash', 'tutor', 'Elaine Lee'),
('jordan.yu@student.edu', '$2a$10$dummy_hash', 'tutor', 'Jordan Yu'),
('casey.huang@student.edu', '$2a$10$dummy_hash', 'tutor', 'Casey Huang'),
('alex.morgan@student.edu', '$2a$10$dummy_hash', 'tutor', 'Alex Morgan'),
('sam.rivera@student.edu', '$2a$10$dummy_hash', 'tutor', 'Sam Rivera'),
('riley.chen@student.edu', '$2a$10$dummy_hash', 'tutor', 'Riley Chen'),
('taylor.kim@student.edu', '$2a$10$dummy_hash', 'tutor', 'Taylor Kim'),
('jamie.park@student.edu', '$2a$10$dummy_hash', 'tutor', 'Jamie Park'),
('morgan.lee@student.edu', '$2a$10$dummy_hash', 'tutor', 'Morgan Lee'),
('avery.jones@student.edu', '$2a$10$dummy_hash', 'tutor', 'Avery Jones'),
('dakota.smith@student.edu', '$2a$10$dummy_hash', 'tutor', 'Dakota Smith'),
('phoenix.lee@student.edu', '$2a$10$dummy_hash', 'tutor', 'Phoenix Lee'),
('sage.wilson@student.edu', '$2a$10$dummy_hash', 'tutor', 'Sage Wilson'),
('river.martinez@student.edu', '$2a$10$dummy_hash', 'tutor', 'River Martinez')
ON CONFLICT (email) DO NOTHING;

INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year)
SELECT 
    (SELECT id FROM users WHERE email = 'sarah.kim@uni.edu'),
    'FIT3077',
    'Software Engineering: Architecture and Design',
    'Semester 1',
    2025
WHERE NOT EXISTS (SELECT 1 FROM units WHERE unit_code = 'FIT3077');

INSERT INTO sessions (unit_id, day, start_time, end_time, location, session_type, capacity)
SELECT 
    (SELECT id FROM units WHERE unit_code = 'FIT3077'),
    day,
    start_time::time,
    end_time::time,
    location,
    'tutorial',
    25
FROM (VALUES 
    ('Monday', '08:00', '10:00', 'S303'),
    ('Tuesday', '12:00', '14:00', 'S303'),
    ('Thursday', '15:00', '17:00', 'S302')
) AS v(day, start_time, end_time, location)
WHERE NOT EXISTS (
    SELECT 1 FROM sessions s
    JOIN units u ON s.unit_id = u.id
    WHERE u.unit_code = 'FIT3077' AND s.day = v.day
);

-- Verify setup
SELECT 'Setup complete!' as message;
SELECT COUNT(*) as user_count FROM users;
SELECT COUNT(*) as unit_count FROM units;
SELECT COUNT(*) as session_count FROM sessions;
SELECT COUNT(*) as tutor_count FROM users WHERE role = 'tutor';
