UPDATE user_profile
SET ai_chat_model = 'accounts/fireworks/models/kimi-k2p6'
WHERE ai_chat_model IS NULL
   OR ai_chat_model = ''
   OR ai_chat_model = 'accounts/fireworks/models/kimi-k2-instruct-0905';

UPDATE user_profile
SET ai_quality_model = 'accounts/fireworks/models/minimax-m3'
WHERE ai_quality_model IS NULL
   OR ai_quality_model = ''
   OR ai_quality_model = 'accounts/fireworks/models/deepseek-v3p1';

SELECT ai_quality_model, ai_chat_model, count(*) AS n
FROM user_profile
GROUP BY 1, 2;
