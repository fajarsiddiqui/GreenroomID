export async function resolveGambarinOriginal(jobId, mock, loadReal, loadMock) {
  return mock ? { url: await loadMock(jobId), mock: true }
    : { url: await loadReal(jobId), mock: false }
}
