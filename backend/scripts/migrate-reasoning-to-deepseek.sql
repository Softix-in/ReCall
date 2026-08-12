UPDATE user_profile
SET ai_reasoning_model = 'accounts/fireworks/models/deepseek-v4-flash-0731'
WHERE ai_reasoning_model IS NULL
   OR ai_reasoning_model = ''
   OR ai_reasoning_model = 'accounts/fireworks/models/glm-5p2';

SELECT ai_quality_model, ai_chat_model, ai_reasoning_model
FROM user_profile;
