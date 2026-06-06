export const SERVICE_PORTS = {
  gateway: Number(process.env.API_GATEWAY_PORT || 4000),
  auth: Number(process.env.AUTH_SERVICE_PORT || 4101),
  entity: Number(process.env.ENTITY_SERVICE_PORT || 4102),
  financial: Number(process.env.FINANCIAL_SERVICE_PORT || 4103),
  project: Number(process.env.PROJECT_SERVICE_PORT || 4104),
  analytics: Number(process.env.ANALYTICS_SERVICE_PORT || 4105),
  announcement: Number(process.env.ANNOUNCEMENT_SERVICE_PORT || 4106),
  auditLog: Number(process.env.AUDIT_LOG_SERVICE_PORT || 4107),
} as const;

const resolveServiceUrl = (envName: string, fallbackPort: number) => {
  const configured = process.env[envName]?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  return `http://127.0.0.1:${fallbackPort}`;
};

export const SERVICE_URLS = {
  auth: resolveServiceUrl('AUTH_SERVICE_URL', SERVICE_PORTS.auth),
  entity: resolveServiceUrl('ENTITY_SERVICE_URL', SERVICE_PORTS.entity),
  financial: resolveServiceUrl('FINANCIAL_SERVICE_URL', SERVICE_PORTS.financial),
  project: resolveServiceUrl('PROJECT_SERVICE_URL', SERVICE_PORTS.project),
  analytics: resolveServiceUrl('ANALYTICS_SERVICE_URL', SERVICE_PORTS.analytics),
  announcement: resolveServiceUrl('ANNOUNCEMENT_SERVICE_URL', SERVICE_PORTS.announcement),
  auditLog: resolveServiceUrl('AUDIT_LOG_SERVICE_URL', SERVICE_PORTS.auditLog),
} as const;
