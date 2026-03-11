CREATE TABLE IF NOT EXISTS folders (
    id BIGSERIAL PRIMARY KEY,                          -- unique folder ID
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,                        -- folder name
    parent_id BIGINT REFERENCES folders(id) ON DELETE CASCADE,  -- parent folder
    created_by UUID  REFERENCES users(id) ON DELETE SET NULL,  -- owner
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, parent_id, name)               -- prevent duplicate folder names under same parent
);


    
