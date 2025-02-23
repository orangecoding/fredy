import { XhrApiResponse, XhrApiResponseError } from '../types/XhrApi';

/**
 * post something to our backend.
 *
 * @param url
 * @param data based on the content type, you need to make sure to parse in the proper data
 * @param contentType default is json
 * @returns {Promise}
 */
export function xhrPost<ReqT, ResT = void>(
  url: string,
  data: ReqT,
  contentType = 'application/json; charset=utf-8',
  isJson = true,
): Promise<XhrApiResponse<ResT>> {
  return executePostOrPutCall(url, contentType, data, isJson, true);
}
/**
 * put request to backend.
 *
 * @param url
 * @param data based on the content type, you need to make sure to parse in the proper data
 * @param contentType default is json
 * @returns {Promise}
 */
export function xhrPut<ReqT, ResT = void>(
  url: string,
  data: ReqT,
  contentType = 'application/json; charset=utf-8',
  isJson = true,
): Promise<XhrApiResponse<ResT>> {
  return executePostOrPutCall(url, contentType, data, isJson, false);
}

function executePostOrPutCall<ReqT, ResT>(
  url: string,
  contentType: string,
  data: ReqT,
  isJson: boolean,
  isPost: boolean,
): Promise<XhrApiResponse<ResT>> {
  return new Promise((resolve, reject) => {
    fetch(url, {
      method: isPost ? 'POST' : 'PUT',
      cache: 'no-cache',
      credentials: 'include',
      mode: 'cors',
      headers: {
        'Content-Type': contentType,
      },
      body: data == null ? JSON.stringify({}) : typeof data === 'string' ? data : JSON.stringify(data),
    })
      .then((response) => (isJson ? parseJSON(response) : response))
      .then((response) => resolve(response as XhrApiResponse<ResT>))
      .catch((error) => {
        reject(error);
      });
  });
}
/**
 * get request to backend
 * returns a Promise with
 * {
 *     status: statusCode,
 *     json: values
 * }
 *
 * if an error occurs, the promise rejects with
 * {
 *     json: errors: ['error', 'error']
 * }
 * @param url
 * @param contentType
 * @param isJson
 * @returns {Promise}
 */
export function xhrGet<ResT>(
  url: string,
  contentType = 'application/json; charset=utf-8',
  isJson = true,
): Promise<XhrApiResponse<ResT>> {
  return new Promise((resolve, reject) => {
    fetch(url, {
      credentials: 'include',
      mode: 'cors',
      headers: {
        'Content-Type': contentType,
      },
    })
      .then((response) => (isJson ? parseJSON(response) : response))
      .then((response) => resolve(response as XhrApiResponse<ResT>))
      .catch((error) => {
        reject(error);
      });
  });
}
/**
 * delete request to backend
 * returns a Promise with
 * {
 *     status: statusCode,
 *     json: values
 * }
 *
 * if an error occurs, the promise rejects with
 * {
 *     json: errors: ['error', 'error']
 * }
 * @param url
 * @param data
 * @returns {Promise}
 */
export function xhrDelete<ReqT, ResT = void>(
  url: string,
  data: ReqT,
  contentType = 'application/json; charset=utf-8',
): Promise<XhrApiResponse<ResT>> {
  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'DELETE',
      credentials: 'include',
      mode: 'cors',
      body: data == null ? '{}' : JSON.stringify(data),
      headers: {
        'Content-Type': contentType,
      },
    })
      .then((response) => parseJSON(response))
      .then((response) => resolve(response as XhrApiResponse<ResT>))
      .catch((error) => {
        reject(error);
      });
  });
}
function parseJSON<T>(response: Response): Promise<XhrApiResponse<T> | XhrApiResponseError> {
  return new Promise((resolve, reject) =>
    response
      .text()
      .then((text: string) => {
        //some responses doesn't contain a body. .json() would throw errors here...
        const json = text != null && text.length > 0 ? JSON.parse(text) : {};
        if (response.ok) {
          resolve({
            status: response.status,
            json,
          });
        } else {
          reject({
            status: response.status,
            json,
          });
        }
      })
      .catch((error: Error) =>
        reject({
          status: response.status,
          json: { errors: [`Error parsing JSON: ${error.message}`] },
        }),
      ),
  );
}

export function parseError(
  error: XhrApiResponseError | Error,
  defaultErrorMessage = 'An unknown error occurred',
): string {
  try {
    if (error instanceof Error) {
      return error.message;
    }
    return error.json.errors.join(', ');
  } catch (error) {
    console.error('Error parsing error:', error);
    return defaultErrorMessage;
  }
}
