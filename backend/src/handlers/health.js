/**
 * Perseus Clew health check handler.
 * Returns engine status for connectivity verification.
 */
export const handler = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    status: 'ok',
    version: '0.1',
    name: 'Perseus Clew engine',
    scanner: 'Agentis Lux'
  })
});
