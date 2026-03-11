CREATE TABLE IF NOT EXISTS files (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    folder_id BIGINT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_version_number INT DEFAULT 1, -- optional, shows number of publishes
    UNIQUE (tenant_id, folder_id, name)
);