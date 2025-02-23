import { xhrGet } from '../../xhr';
export const user = {
  state: {
    users: [],
    currentUser: null,
  },
  reducers: {
    //only admins
    setUsers: (state, payload) => {
      return {
        ...state,
        users: payload,
      };
    },
    setCurrentUser: (state, payload) => {
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
        this.setUsers(response.json);
      } catch (Exception) {
        console.error('Error while trying to get resource for api/admin/users. Error:', Exception);
      }
    },
    async getCurrentUser() {
      try {
        const response = await xhrGet('/api/login/user');
        this.setCurrentUser(response.json);
      } catch (Exception) {
        console.error('Error while trying to get resource for api/login/user. Error:', Exception);
      }
    },
  },
};
