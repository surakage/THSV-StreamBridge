const TEST_SERVER = 'http://127.0.0.1:8799';
const TEST_TOKEN = 'playwright-control-token-with-32-characters';

export default async function stopBrowserTestServer(): Promise<void> {
  try {
    await fetch(`${TEST_SERVER}/shutdown`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // A stopped or already-closed disposable server needs no further cleanup.
  }
}
