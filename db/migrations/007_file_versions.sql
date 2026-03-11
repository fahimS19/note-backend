CREATE TABLE IF NOT EXISTS file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id BIGINT REFERENCES files(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- who created the draft
    content TEXT NOT NULL,
    note TEXT,                   -- optional comment/message
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','accepted')), 
        -- draft, accepted/published
    created_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,       -- when owner accepted/published
    accepted_by UUID REFERENCES users(id),  -- owner who accepted
    UNIQUE(file_id, author_id)   -- ensures one draft per user per file
);

CREATE INDEX idx_file_versions_file_created
ON file_versions (file_id, created_at DESC);
CREATE INDEX idx_file_versions_file_status
ON file_versions (file_id, status);