// Test fetchWithRetry logic by extracting and re-implementing the retry pattern.
// The actual function is not exported, so we test the pattern in isolation.

// Simulates the fetchWithRetry logic from lib/api.js
async function fetchWithRetry(mockFetch, url, options, { retries = 1, backoffMs = 10 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await mockFetch(url, options);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const err = new Error(error.error || `Request failed (${res.status})`);
        err.retryable = error.retryable || res.status >= 500;
        throw err;
      }
      return res.json();
    } catch (err) {
      const isLastAttempt = attempt >= retries;
      const shouldRetry = !isLastAttempt && (err.retryable !== false) && err.name !== 'AbortError';
      if (!shouldRetry) throw err;
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

function mockResponse(status, body = {}, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('fetchWithRetry', () => {
  it('returns data on first successful attempt', async () => {
    const fetch = jest.fn().mockResolvedValue(mockResponse(200, { data: 'ok' }));
    const result = await fetchWithRetry(fetch, '/api/test', {});
    expect(result).toEqual({ data: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 error and succeeds on second attempt', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(mockResponse(500, { error: 'server error' }))
      .mockResolvedValueOnce(mockResponse(200, { data: 'recovered' }));

    const result = await fetchWithRetry(fetch, '/api/test', {}, { retries: 1, backoffMs: 10 });
    expect(result).toEqual({ data: 'recovered' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fetch = jest.fn().mockResolvedValue(mockResponse(500, { error: 'still broken' }));

    await expect(
      fetchWithRetry(fetch, '/api/test', {}, { retries: 1, backoffMs: 10 })
    ).rejects.toThrow('still broken');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry AbortError', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    const fetch = jest.fn().mockRejectedValue(abortErr);

    await expect(
      fetchWithRetry(fetch, '/api/test', {}, { retries: 2, backoffMs: 10 })
    ).rejects.toThrow('aborted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry when retryable is explicitly false', async () => {
    const fetch = jest.fn().mockResolvedValue(
      mockResponse(400, { error: 'bad request', retryable: false })
    );

    await expect(
      fetchWithRetry(fetch, '/api/test', {}, { retries: 2, backoffMs: 10 })
    ).rejects.toThrow('bad request');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('marks 4xx errors as non-retryable by default', async () => {
    const fetch = jest.fn().mockResolvedValue(mockResponse(404, { error: 'not found' }));

    await expect(
      fetchWithRetry(fetch, '/api/test', {}, { retries: 1, backoffMs: 10 })
    ).rejects.toThrow('not found');
    // 404 has retryable = false (status < 500), so no retry
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to generic error message when json parsing fails', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: jest.fn().mockRejectedValue(new Error('not json')),
    });

    await expect(
      fetchWithRetry(fetch, '/api/test', {}, { retries: 0, backoffMs: 10 })
    ).rejects.toThrow('Request failed (502)');
  });
});
