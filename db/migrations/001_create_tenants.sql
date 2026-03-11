
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),     -- unique tenant ID
    name VARCHAR(50) NOT NULL UNIQUE,                -- tenant/group name
    password VARCHAR(100) NOT NULL,                   -- hashed join password
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- user who created tenant
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);