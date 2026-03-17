const endpoints = {
  auth: {
    login: '/login',
    logout: '/logout',
    checkAuth: '/check-auth'
  },
  users: {
    list: '/users',
    create: '/add-user',
    delete: id => `/delete-user/${id}`,
    update: id => `/update-user/${id}`,
    changePassword: id => `/change-password/${id}`,
    changeOwnPassword: '/change-own-password',
  },
  licenses: {
    list: '/api/admin/licenses',
    update: id => `/api/admin/licenses/${id}`,
    remove: id => `/api/admin/licenses/${id}`,
  },
};

export default endpoints;
