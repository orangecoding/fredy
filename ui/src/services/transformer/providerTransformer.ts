export interface ProviderData {
  name: string;
  id: string;
  enabled?: boolean;
  url: string;
}

export function transform({ name, id, enabled, url }: ProviderData) {
  return {
    name,
    id,
    enabled,
    url,
  };
}
