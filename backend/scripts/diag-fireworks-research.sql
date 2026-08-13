SELECT
  CASE
    WHEN fireworks_api_key_enc IS NULL OR fireworks_api_key_enc = '' THEN 'no_profile_key'
    ELSE 'has_profile_key'
  END AS key_state,
  ai_quality_model,
  ai_chat_model,
  ai_reasoning_model
FROM user_profile;

SELECT
  id,
  status,
  current_step,
  left(coalesce(error, ''), 160) AS err
FROM research_jobs
ORDER BY created_at DESC
LIMIT 8;
