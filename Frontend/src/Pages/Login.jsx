import { Box, createTheme, styled, ThemeProvider } from '@mui/material';
import Navbar from '../Components/Navbar/Navbar';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { DarkModeContext } from '../Context/DarkModeProvider';
import { useContext, useEffect, useState } from 'react';
import axios from '../API/axios';
import { AUTH_TOKEN_KEY } from '../API/axios';
import endpoints from '../API/endpoints';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../Context/AuthProvider';
import LoadingScreen from '../Components/Common/LoadingScreen';
import { AiOutlineEye, AiOutlineEyeInvisible } from 'react-icons/ai';
import { Lock, User } from 'lucide-react';
import HerculesNewLogo from '../Assets/Hercules_New.png';

const validationSchema = Yup.object({
  username: Yup.string().required('Username is required'),
  password: Yup.string()
    .required('Password is required')
    .min(2, 'Password must be at least 2 characters long'),
});

function Login() {
  useEffect(() => { document.title = 'Hercules — Login'; }, []);

  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { setAuth, setAuthLoading } = useContext(AuthContext);

  const loginUser = async values => {
    setLoading(true);
    try {
      const response = await axios.post(endpoints.auth.login, values, { withCredentials: true });
      if (response.status === 200 && response.data?.user_data) {
        toast.success('Logged in!..', { theme: 'dark' });
        const userData = response.data.user_data;
        setAuth(userData);
        if (userData?.auth_token) {
          try { localStorage.setItem(AUTH_TOKEN_KEY, userData.auth_token); } catch (_) {}
        }
        setAuthLoading(false);
        navigate('/');
      }
    } catch (error) {
      let errorMessage = 'Login failed. Please try again.';
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. Please check if the backend is running.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.status === 401) {
        errorMessage = 'Invalid username or password.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (!error.response) {
        errorMessage = 'Cannot connect to server. Please check if the backend is running.';
      }
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const [showPassword, setShowPassword] = useState(false);

  const formik = useFormik({
    initialValues: { username: '', password: '' },
    validationSchema,
    onSubmit: values => { loginUser(values); },
  });

  const { mode } = useContext(DarkModeContext);
  const theme = createTheme({ colorSchemes: { dark: mode === 'dark' } });

  useEffect(() => { setLoading(false); }, []);

  return (
    <ThemeProvider theme={theme}>
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f9] dark:bg-[#040810] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />

        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--brand)] opacity-[0.03] dark:opacity-[0.05] rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[var(--brand)] opacity-[0.02] dark:opacity-[0.04] rounded-full blur-[80px]" />

        {loading && <LoadingScreen />}

        <div className="relative z-10 w-full max-w-[380px] mx-4 animate-scale-in">
          <div className="text-center mb-8">
            <img
              src={HerculesNewLogo}
              alt="HERCULES"
              className="h-10 w-auto mx-auto mb-4 dark:[filter:brightness(0)_invert(1)]"
            />
            <h1 className="text-xl font-bold text-[#0f1729] dark:text-[#f0f4f8] tracking-tight">
              Welcome back
            </h1>
            <p className="text-[13px] text-[#64748b] dark:text-[#64748b] mt-1">
              Sign in to your Mission Control
            </p>
          </div>

          <div
            className="bg-white/90 dark:bg-[#0a1120]/90 rounded-2xl border border-black/[0.08] dark:border-white/[0.06] p-6 shadow-xl dark:shadow-2xl"
            style={{
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-[#64748b] mb-1.5 block">
                  Username
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    type="text"
                    name="username"
                    value={formik.values.username}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Enter username"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#f8f9fb] dark:bg-[#0f1a2e] border text-[13px] text-[#0f1729] dark:text-[#f0f4f8] placeholder:text-[#94a3b8] outline-none transition-all duration-200 ${
                      formik.touched.username && formik.errors.username
                        ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20'
                        : 'border-black/[0.08] dark:border-white/[0.08] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]'
                    }`}
                  />
                </div>
                {formik.touched.username && formik.errors.username && (
                  <p className="text-[11px] text-red-500 mt-1">{formik.errors.username}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b] dark:text-[#64748b] mb-1.5 block">
                  Password
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Enter password"
                    className={`w-full pl-9 pr-10 py-2.5 rounded-lg bg-[#f8f9fb] dark:bg-[#0f1a2e] border text-[13px] text-[#0f1729] dark:text-[#f0f4f8] placeholder:text-[#94a3b8] outline-none transition-all duration-200 ${
                      formik.touched.password && formik.errors.password
                        ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20'
                        : 'border-black/[0.08] dark:border-white/[0.08] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] dark:hover:text-[#cbd5e1] transition-colors"
                  >
                    {showPassword ? <AiOutlineEyeInvisible size={16} /> : <AiOutlineEye size={16} />}
                  </button>
                </div>
                {formik.touched.password && formik.errors.password && (
                  <p className="text-[11px] text-red-500 mt-1">{formik.errors.password}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-2.5 rounded-lg bg-gradient-to-r from-[var(--brand)] to-[#0284c7] dark:from-[#0ea5e9] dark:to-[#38bdf8] text-white text-[13px] font-semibold shadow-lg shadow-[var(--brand)]/20 hover:shadow-xl hover:shadow-[var(--brand)]/30 transition-all duration-300 hover:translate-y-[-1px] active:translate-y-0"
              >
                Sign in
              </button>
            </form>
          </div>

          <p className="text-center text-[10px] text-[#94a3b8] dark:text-[#475569] mt-6 tracking-wider uppercase">
            Hercules v2 Industrial SCADA
          </p>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default Login;
