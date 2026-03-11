CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),      -- unique join ID
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',                  -- role in the tenant: owner/admin/member/viewer
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, user_id)                        -- prevent duplicate entries
);