UPDATE user_profile SET fireworks_api_key_enc = NULL;

SELECT
  CASE
    WHEN fireworks_api_key_enc IS NULL OR fireworks_api_key_enc = '' THEN 'cleared'
    ELSE 'still_set'
  END AS key_state,
  ai_quality_model,
  ai_chat_model,
  ai_reasoning_model
FROM user_profile;
