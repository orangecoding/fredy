import { ApiErrorRes } from '#types/Api.ts';

export interface XhrApiResponse<T> {
  json: T;
  status: number;
}

export interface XhrApiResponseError {
  json: ApiErrorRes;
  status: number;
}
