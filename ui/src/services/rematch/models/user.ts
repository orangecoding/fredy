import { xhrGet } from '../../xhr';
export const user = {
  state: {
    users: [],
    currentUser: null,
  },
  reducers: {
    //only admins
    setUsers: (state: any, payload: any) => {
      return {
        ...state,
        users: payload,
      };
    },
    setCurrentUser: (state: any, payload: any) => {
      return {
        ...state,
        currentUser: Object.freeze(payload),
      };
    },
  },
  effects: {
    async getUsers() {
      try {
        const response = await xhrGet('/api/admin/users');
        // @ts-expect-error TS(2551): Property 'setUsers' does not exist on type '{ getU... Remove this comment to see the full error message
        this.setUsers(response.json);
      } catch (Exception) {
        console.error('Error while trying to get resource for api/admin/users. Error:', Exception);
      }
    },
    async getCurrentUser() {
      try {
        const response = await xhrGet('/api/login/user');
        // @ts-expect-error TS(2551): Property 'setCurrentUser' does not exist on type '... Remove this comment to see the full error message
        this.setCurrentUser(response.json);
      } catch (Exception) {
        console.error('Error while trying to get resource for api/login/user. Error:', Exception);
      }
    },
  },
};
