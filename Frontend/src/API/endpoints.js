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
};

export default endpoints;
