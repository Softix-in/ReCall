const { classifyUrl } = require('../src/pipeline/classify');

const cases = [
  ['https://www.youtube.com/watch?v=abc', 'video'],
  ['https://youtu.be/abc', 'video'],
  ['https://www.tiktok.com/@user/video/1', 'video'],
  ['https://www.instagram.com/reels/abc/', 'video'],
  ['https://twitter.com/user/status/1', 'social-post'],
  ['https://x.com/user/status/1', 'social-post'],
  ['https://x.com/user/status/1/video/2', 'video'],
  ['https://medium.com/@user/post', 'article'],
  ['https://user.substack.com/p/post', 'article'],
  ['https://dev.to/user/post-slug', 'article'],
  ['https://example.com/page', 'link'],
  ['https://docs.github.com/en/actions', 'link'],
  ['https://blog.example.com/post', 'article'],
  ['https://news.ycombinator.com/item?id=1', 'link'],
  ['https://www.reddit.com/r/node/comments/abc', 'link'],
  ['https://www.youtube.com/shorts/abc', 'video'],
  ['https://openai.com/index/some-post', 'article', { og_type: 'article' }],
  // og:type=video on a generic domain is now treated as link (not a real video host)
  ['https://example.com/watch', 'link', { og_type: 'video' }],
  // og:type=video on a known video host does classify as video
  ['https://www.youtube.com/watch?v=abc', 'video', { og_type: 'video' }],
  ['https://twitter.com/user/status/1', 'video', { has_video: true }],
  ['https://personal.github.io/blog/post', 'article'],
  ['https://stackoverflow.com/questions/1', 'link'],
  ['https://www.nytimes.com/2024/01/01/world/article.html', 'link'],
];

let failed = 0;

for (const [url, expected, metadata] of cases) {
  const actual = classifyUrl(url, metadata || {});
  const pass = actual === expected;

  if (!pass) {
    failed += 1;
    console.error(`FAIL ${url} → expected ${expected}, got ${actual}`);
  } else {
    console.log(`OK   ${expected.padEnd(12)} ${url}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} classification test(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${cases.length} classification tests passed.`);
