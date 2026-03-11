
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- unique user ID
    username VARCHAR(50) NOT NULL,
    email VARCHAR(50) NOT NULL UNIQUE,           -- login email
    password VARCHAR(100) NOT NULL,               -- hashed password
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);