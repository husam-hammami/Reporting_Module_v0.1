-- Users table for login and role-based access.
-- Run this if you get 500 on /add-user or "relation \"users\" does not exist".
-- Database: same as app (POSTGRES_DB, default Dynamic_DB_Hercules).

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
