export async function publicFetcher(path: string, opt?: Record<string, unknown>) {
    const response = await window.fetch(path, opt);
    if (response.status >= 400 && response.status < 600) {
      throw response;
    }
    const contentType = response.headers.get('Content-Type');
    if (contentType?.includes('text/') || contentType?.includes('application/octet-stream') || !contentType) return response.text();
    return response.json();
}