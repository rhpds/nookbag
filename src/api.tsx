export const API = 'http://zerotouch-api.apps.babydev.dev.open.redhat.com'

type ResourceType = 'CATALOG_ITEM' | 'START_PROVISION' | 'PROVISION';

export const apiPaths: { [key in ResourceType]: (args: any) => string } = {
    CATALOG_ITEM: ({ name }: { name: string }): string =>
      `${API}/catalogItems/${name}`,
    START_PROVISION: ({}): string => `${API}/serviceRequest`,
    PROVISION: ({name}: {name:string}) : string => `${API}/serviceRequest/${name}`,
};

export async function publicFetcher(path: string, opt?: Record<string, unknown>) {
    const response = await window.fetch(path, opt);
    if (response.status >= 400 && response.status < 600) {
      throw response;
    }
    const contentType = response.headers.get('Content-Type');
    if (contentType?.includes('text/') || contentType?.includes('application/octet-stream') || !contentType) return response.text();
    return response.json();
}