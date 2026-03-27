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
import { useLanguage } from '../Hooks/useLanguage';
import HerculesNewLogo from '../Assets/Hercules_New.png';

function Login() {
  useEffect(() => { document.title = 'Hercules — Login'; }, []);

  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { setAuth, setAuthLoading } = useContext(AuthContext);
  const { t, isRTL } = useLanguage();

  const validationSchema = Yup.object({
    username: Yup.string().required(t('validation.usernameRequired')),
    password: Yup.string()
      .required(t('validation.passwordRequired'))
      .min(2, t('validation.passwordMin')),
  });

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
      <div className="min-h-screen flex items-center justify-center bg-transparent relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
          style={{
            zIndex: 2,
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />

        {loading && <LoadingScreen />}

        <div className="relative z-10 w-full max-w-[400px] mx-4 animate-scale-in">
          <div className="text-center mb-8">
            <img
              src={HerculesNewLogo}
              alt="HERCULES"
              className="h-14 w-auto mx-auto mb-5 dark:[filter:brightness(0)_invert(1)_brightness(0.85)]"
            />
            <h1 className="text-xl font-bold text-[#0f1729] dark:text-[#e8edf5] tracking-tight">
              {t('login.welcome')}
            </h1>
            <p className="text-[13px] text-[#64748b] dark:text-[#556677] mt-1">
              {t('login.subtitle')}
            </p>
          </div>

          <div
            className="bg-white/90 dark:bg-[#091422]/95 rounded-xl border border-black/[0.08] dark:border-[#22d3ee]/25 p-6 shadow-xl dark:shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(34,211,238,0.12)]"
          >
            <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b] dark:text-[#22d3ee]/50 mb-1.5 block">
                  {t('login.username')}
                </label>
                <div className="relative">
                  <User size={14} className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-[#94a3b8] dark:text-[#556677]`} />
                  <input
                    type="text"
                    name="username"
                    value={formik.values.username}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder={t('login.usernamePlaceholder')}
                    className={`w-full ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'} py-2.5 rounded-lg bg-[#f8f9fb] dark:bg-[#080d19] border text-[13px] text-[#0f1729] dark:text-[#e8edf5] placeholder:text-[#94a3b8] dark:placeholder:text-[#445566] outline-none transition-all duration-200 ${
                      formik.touched.username && formik.errors.username
                        ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20'
                        : 'border-black/[0.08] dark:border-[#22d3ee]/10 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)] dark:focus:border-[#22d3ee]/40 dark:focus:ring-[#22d3ee]/15'
                    }`}
                  />
                </div>
                {formik.touched.username && formik.errors.username && (
                  <p className="text-[11px] text-red-500 mt-1">{formik.errors.username}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b] dark:text-[#22d3ee]/50 mb-1.5 block">
                  {t('login.password')}
                </label>
                <div className="relative">
                  <Lock size={14} className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-[#94a3b8] dark:text-[#556677]`} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder={t('login.passwordPlaceholder')}
                    className={`w-full ${isRTL ? 'pr-9 pl-10' : 'pl-9 pr-10'} py-2.5 rounded-lg bg-[#f8f9fb] dark:bg-[#080d19] border text-[13px] text-[#0f1729] dark:text-[#e8edf5] placeholder:text-[#94a3b8] dark:placeholder:text-[#445566] outline-none transition-all duration-200 ${
                      formik.touched.password && formik.errors.password
                        ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20'
                        : 'border-black/[0.08] dark:border-[#22d3ee]/10 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)] dark:focus:border-[#22d3ee]/40 dark:focus:ring-[#22d3ee]/15'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] dark:text-[#556677] dark:hover:text-[#8899ab] transition-colors`}
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
                className="w-full mt-2 py-2.5 rounded-lg bg-gradient-to-r from-[var(--brand)] to-[#0284c7] dark:from-[#0e7490] dark:to-[#22d3ee] text-white text-[13px] font-semibold shadow-lg shadow-[var(--brand)]/20 dark:shadow-[#22d3ee]/10 hover:shadow-xl transition-all duration-300 hover:translate-y-[-1px] active:translate-y-0"
              >
                {t('login.signIn')}
              </button>
            </form>
          </div>

          <p className="text-center text-[10px] text-[#94a3b8] dark:text-[#445566] mt-6 tracking-[0.15em] uppercase font-semibold">
            {t('login.tagline')}
          </p>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default Login;
