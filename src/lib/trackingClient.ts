/**
 * Appends the organization a Super Admin is viewing to a tracking API URL.
 * Other roles never pass one; the server ignores it for them anyway.
 */
export function withOrg(url: string, organizationId?: string | null): string {
  if (!organizationId) return url;
  return `${url}${url.includes('?') ? '&' : '?'}organizationId=${encodeURIComponent(organizationId)}`;
}
