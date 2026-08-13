const DEFAULT_DEBOUNCE_MS = 220;
const MIN_QUERY_LENGTH = 2;

export function createLiveSearchRunner({ debounceMs = DEFAULT_DEBOUNCE_MS, minLength = MIN_QUERY_LENGTH } = {}) {
  let timer = null;
  let requestId = 0;
  let abortController = null;

  function cancel() {
    clearTimeout(timer);
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  function schedule(query, run) {
    cancel();

    const trimmed = query.trim();

    if (trimmed.length < minLength) {
      return Promise.resolve(run({ query: trimmed, empty: true, requestId: ++requestId }));
    }

    return new Promise((resolve) => {
      timer = setTimeout(async () => {
        const currentId = ++requestId;

        if (abortController) {
          abortController.abort();
        }

        abortController = new AbortController();

        try {
          const result = await run({
            query: trimmed,
            empty: false,
            requestId: currentId,
            signal: abortController.signal,
          });

          if (currentId === requestId) {
            resolve(result);
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            return;
          }

          if (currentId === requestId) {
            resolve({ error });
          }
        }
      }, debounceMs);
    });
  }

  return { schedule, cancel };
}
