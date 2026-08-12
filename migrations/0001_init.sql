CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  blogger_blog_id TEXT,
  blogger_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE (publication_id, slug)
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id),
  category_id TEXT REFERENCES categories(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  updated_at TEXT,
  canonical_url TEXT,
  blogger_blog_id TEXT,
  blogger_post_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (publication_id, slug),
  UNIQUE (blogger_blog_id, blogger_post_id)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id),
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE blogger_sync (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  blogger_blog_id TEXT NOT NULL,
  blogger_post_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_synced_at TEXT,
  error TEXT,
  UNIQUE (post_id)
);

CREATE TABLE login_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_posts_publication_status ON posts (publication_id, status);
CREATE INDEX idx_posts_slug ON posts (publication_id, slug);
CREATE INDEX idx_posts_blogger ON posts (blogger_blog_id, blogger_post_id);
CREATE INDEX idx_post_tags_tag ON post_tags (tag_id);
CREATE INDEX idx_media_post ON media (post_id);
