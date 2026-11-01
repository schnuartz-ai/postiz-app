import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import fetch, { FormData } from 'node-fetch';

type FetchImpl = typeof fetch;
type JsonBody = Record<string, any> | Array<any>;

function toQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

function normalizeBasePath(path: string): string {
  const url = new URL(path);
  const pathname = url.pathname.replace(/\/+$/, '');

  if (
    pathname.endsWith('/api/public/v1') ||
    pathname.endsWith('/public/v1')
  ) {
    url.pathname = pathname;
    return url.toString().replace(/\/$/, '');
  }

  if (pathname.endsWith('/api')) {
    url.pathname = `${pathname}/public/v1`;
    return url.toString().replace(/\/$/, '');
  }

  if (url.hostname === 'api.postiz.com' || url.hostname.startsWith('api.')) {
    url.pathname = `${pathname}/public/v1`;
    return url.toString().replace(/\/$/, '');
  }

  url.pathname = `${pathname}/api/public/v1`;
  return url.toString().replace(/\/$/, '');
}

export default class Postiz {
  private _basePath: string;

  constructor(
    private _apiKey: string,
    path = 'https://api.postiz.com',
    private _fetch: FetchImpl = fetch
  ) {
    this._basePath = normalizeBasePath(path);
  }

  private async _json<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: JsonBody;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;
    const response = await this._fetch(`${this._basePath}${endpoint}`, {
      method,
      headers: {
        Authorization: this._apiKey,
        ...headers,
      },
      ...(body
        ? {
            body: JSON.stringify(body),
            headers: {
              'Content-Type': 'application/json',
              Authorization: this._apiKey,
              ...headers,
            },
          }
        : {}),
    });

    return response.json() as Promise<T>;
  }

  private _raw(endpoint: string, method: 'DELETE') {
    return this._fetch(`${this._basePath}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this._apiKey,
      },
    });
  }

  async post(posts: CreatePostDto) {
    return this._json('/posts', {
      method: 'POST',
      body: posts as unknown as JsonBody,
    });
  }

  async postList(filters: GetPostsDto) {
    return this._json(`/posts?${toQueryString(filters as Record<string, any>)}`);
  }

  async upload(file: Buffer, extension: string) {
    const formData = new FormData();
    const type =
      extension === 'png'
        ? 'image/png'
        : extension === 'jpg'
        ? 'image/jpeg'
        : extension === 'gif'
        ? 'image/gif'
        : extension === 'jpeg'
        ? 'image/jpeg'
        : 'image/jpeg';

    const blob = new Blob([file], { type });
    formData.append('file', blob, extension);

    return (
      await this._fetch(`${this._basePath}/upload`, {
        method: 'POST',
        // @ts-ignore
        body: formData,
        headers: {
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async uploadFromUrl(url: string) {
    return this._json('/upload-from-url', {
      method: 'POST',
      body: { url },
    });
  }

  async integrations(group?: string) {
    const query = group ? `?${toQueryString({ group })}` : '';
    return this._json(`/integrations${query}`);
  }

  async groups() {
    return this._json('/groups');
  }

  async integrationSettings(id: string) {
    return this._json(`/integration-settings/${id}`);
  }

  async analytics(integrationId: string, days: number) {
    return this._json(`/analytics/${integrationId}?${toQueryString({ date: days })}`);
  }

  async postAnalytics(postId: string, days: number) {
    return this._json(`/analytics/post/${postId}?${toQueryString({ date: days })}`);
  }

  async notifications(page = 0) {
    return this._json(`/notifications?${toQueryString({ page })}`);
  }

  async findSlot(integrationId: string) {
    return this._json(`/find-slot/${integrationId}`);
  }

  async triggerIntegrationTool(
    integrationId: string,
    methodName: string,
    data: Record<string, string> = {}
  ) {
    return this._json(`/integration-trigger/${integrationId}`, {
      method: 'POST',
      body: { methodName, data },
    });
  }

  async changePostStatus(postId: string, status: 'draft' | 'schedule') {
    return this._json(`/posts/${postId}/status`, {
      method: 'PUT',
      body: { status },
    });
  }

  async getChannelOAuthUrl(integration: string, refresh?: string) {
    const query = refresh ? `?${toQueryString({ refresh })}` : '';
    return this._json(`/social/${integration}${query}`);
  }

  async deleteIntegration(id: string) {
    return this._raw(`/integrations/${id}`, 'DELETE');
  }

  async deletePostGroup(group: string) {
    return this._raw(`/posts/group/${group}`, 'DELETE');
  }

  deletePost(id: string) {
    return this._raw(`/posts/${id}`, 'DELETE');
  }
}
