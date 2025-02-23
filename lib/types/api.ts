import { User } from './User';
import { Job } from './Jobs';
import restana from 'restana';

export type ReqWithSession = restana.Request<restana.Protocol.HTTP> & {
  session?: { currentUser?: string | null } | null;
};

export interface ApiLoginReq {
  username: string;
  password: string;
}

export interface ApiCurrentUserRes {
  id?: string;
  isAdmin?: boolean;
}

export interface ApiSaveUserReq extends Omit<User, 'id'> {
  id?: string | null;
  password2: string;
}

export interface ApiDeleteUserReq {
  id: string;
}

export interface ApiSaveJobReq extends Omit<Job, 'id' | 'userId'> {
  id?: string | null | undefined;
  userId?: string | null | undefined;
}
export interface ApiSetJobStatusReq {
  status: boolean;
}

export interface ApiDeleteJobReq {
  jobId: string;
}

export interface ApiProcessingTimesResponse {
  interval: number;
  lastRun: number | null;
}

export interface ApiErrorRes {
  errors: string[];
}
