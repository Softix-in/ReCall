-- Row-Level Security policies (defense in depth)

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE jd_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY items_user_isolation ON items
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY user_settings_isolation ON user_settings
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY user_profile_isolation ON user_profile
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY projects_user_isolation ON projects
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY jd_analyses_user_isolation ON jd_analyses
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY resume_template_user_isolation ON resume_template
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY refresh_tokens_user_isolation ON refresh_tokens
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- users table: no RLS (auth service uses elevated access for login/register)
