/** Known page paths belong to the hash router; assets and standalone demos do not. */
export function sitePagePath(href: string): string | null {
  const path = href.startsWith('/#/') ? href.slice(2) : href
  return /^(?:\/(?:about|blog|projects|interests)?|\/(?:blog|projects)\/[a-z0-9-]+|\/interests\/(?:music|3d-rendering)|\/interests\/neural-operators(?:\/[a-z0-9-]+)?)(?:[?#].*)?$/.test(path)
    ? path
    : null
}
