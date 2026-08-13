const assert = require('assert');
const { assertPublicHttpUrl, safeHref, UnsafeUrlError } = require('../src/utils/safe-url');

async function expectReject(url) {
  try {
    await assertPublicHttpUrl(url);
    throw new Error(`expected reject: ${url}`);
  } catch (error) {
    assert(error instanceof UnsafeUrlError, `UnsafeUrlError for ${url}: ${error.message}`);
  }
}

async function main() {
  await expectReject('http://127.0.0.1/');
  await expectReject('http://localhost/admin');
  await expectReject('http://169.254.169.254/latest/meta-data/');
  await expectReject('http://10.0.0.1/');
  await expectReject('file:///etc/passwd');
  await expectReject('javascript:alert(1)');
  await expectReject('http://2130706433/');
  await expectReject('http://127.1/');
  await expectReject('http://0x7f000001/');

  const publicUrl = await assertPublicHttpUrl('https://example.com/path');
  assert(publicUrl.startsWith('https://example.com'));

  assert.strictEqual(safeHref('javascript:alert(1)'), '');
  assert.ok(safeHref('https://example.com').startsWith('https://example.com'));

  console.log('safe-url tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
