// Shared template-naming helpers used by every WhatsApp template definition
// file (nurture sequence + operational lifecycle templates). Client-safe —
// no server-only imports — so it can be pulled into client components for
// preview purposes as well as server routes.

export function buildTemplateName(clientCode: string, slug: string): string {
  return `${clientCode}_${slug}`
}

export function defaultClientCode(clientName: string): string {
  const alnum = clientName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return (alnum.slice(0, 6) || 'CLIENT').padEnd(3, 'X')
}
