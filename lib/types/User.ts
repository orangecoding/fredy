export interface User {
  id: string;
  lastLogin?: number;
  username: string;
  password?: string | null | undefined;
  isAdmin: boolean;
  numberOfJobs?: number;
}
