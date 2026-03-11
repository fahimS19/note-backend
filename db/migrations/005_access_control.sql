CREATE TABLE IF NOT EXISTS access_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id BIGINT REFERENCES files(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL
    CHECK(role IN ('owner','editor','viewer'))
    DEFAULT 'viewer',
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, file_id)
);
CREATE INDEX idx_access_controls_file_user
ON access_controls (file_id, user_id);

CREATE INDEX idx_access_controls_user_file
ON access_controls (user_id, file_id);