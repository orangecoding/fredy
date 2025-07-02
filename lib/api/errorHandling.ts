import { ApiErrorRes } from '#types/Api.ts';
import { ServerResponse, IncomingMessage } from 'http';
import restana from 'restana';

export class HTTPError {
  private errors: ApiErrorRes = {
    errors: [],
  };
  private statusCode: number = 500;

  constructor(public res: ServerResponse<IncomingMessage> & restana.ResponseExtensions) {
    this.res.setHeader('Content-Type', 'application/json');
    return this;
  }

  addError(error: string | Error) {
    if (error instanceof Error) {
      this.errors.errors.push(error.message);
    } else {
      this.errors.errors.push(error);
    }
    return this;
  }
  hasErrors() {
    return this.errors.errors.length > 0;
  }
  setStatusCode(statusCode: number) {
    this.statusCode = statusCode;
    return this;
  }
  send() {
    this.res.statusCode = this.statusCode;
    return this.res.send(JSON.stringify(this.errors));
  }
  clear() {
    this.errors.errors = [];
    return this;
  }
}
