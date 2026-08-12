UPDATE user_profile
SET ai_quality_model = 'accounts/fireworks/models/deepseek-v4-flash-0731'
WHERE ai_quality_model IS NULL
   OR ai_quality_model = ''
   OR ai_quality_model = 'accounts/fireworks/models/minimax-m3'
   OR ai_quality_model = 'accounts/fireworks/models/deepseek-v3p1';

SELECT
  CASE
    WHEN fireworks_api_key_enc IS NULL OR fireworks_api_key_enc = '' THEN 'using_env_key'
    ELSE 'has_profile_key'
  END AS key_state,
  ai_quality_model,
  ai_chat_model,
  ai_reasoning_model
FROM user_profile;
