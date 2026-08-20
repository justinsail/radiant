const sleep = ms => new Promise(r => setTimeout(r, ms))

// fetch that retries transient upstream errors (Cloudflare 502/503/504, network
// blips) with backoff. Safe for streaming calls: it decides on the response
// STATUS before the body is consumed.
export async function fetchRetry (url, opts = {}, { tries = 3, delayMs = 600 } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts)
      if ([502, 503, 504].includes(res.status) && i < tries - 1) { last = res; await sleep(delayMs * (i + 1)); continue }
      return res
    } catch (e) {
      last = e
      if (opts.signal?.aborted) throw e
      if (i < tries - 1) { await sleep(delayMs * (i + 1)); continue }
      throw e
    }
  }
  return last
}

// friendly one-liner for a transient upstream error
export function isTransient (status) { return status === 502 || status === 503 || status === 504 }
