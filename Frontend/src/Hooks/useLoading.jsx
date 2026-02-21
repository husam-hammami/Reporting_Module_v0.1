import { useContext } from "react";
import { AuthContext } from "../Context/AuthProvider";

function useLoading() {
  const ctx = useContext(AuthContext);
  if (!ctx) return true; // show splash while auth context is not yet available
  return ctx.authLoading ?? true;
}

export default useLoading;
