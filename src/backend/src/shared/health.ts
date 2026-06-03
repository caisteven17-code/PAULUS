export const createHealthPayload = (service: string) => ({
  service,
  status: 'ok',
  timestamp: new Date().toISOString(),
});
