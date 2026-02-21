import { Navigate, Outlet } from 'react-router-dom';
import { useContext } from 'react';
import { Roles } from '../Data/Roles.js';
import { AuthContext } from '../Context/AuthProvider.jsx';

export function ProtectedRoute({
  children,
  roles = [Roles.Admin, Roles.Manager, Roles.Operator],
}) {
  const { auth } = useContext(AuthContext);
  if (auth && roles.includes(auth.role)) {
    return children ? children : <Outlet />;
  } else {
    return <Navigate to="/login" />;
  }
}

export function ProtectedCredentials(props) {
  const { auth } = useContext(AuthContext);
  if (auth) {
    return <Navigate to="/" />;
  } else {
    return props.children;
  }
}
