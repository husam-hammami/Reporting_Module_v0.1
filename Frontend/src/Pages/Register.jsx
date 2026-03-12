import { createTheme, ThemeProvider } from '@mui/material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { DarkModeContext } from '../Context/DarkModeProvider';
import { useContext, useEffect, useState } from 'react';
import axios from '../API/axios';
import endpoints from '../API/endpoints';
import { toast } from 'react-toastify';
import { useNavigate, Link } from 'react-router-dom';
import { AiOutlineEye, AiOutlineEyeInvisible } from 'react-icons/ai';
import { Lock, User } from 'lucide-react';
import HerculesNewLogo from '../Assets/Hercules_New.png';

const validationSchema = Yup.object({
  username: Yup.string().required('Username is required').trim(),
  password: Yup.string()
    .required('Password is required')
    .min(2, 'Password must be at least 2 characters long'),
  confirmPassword: Yup.string()
    .required('Confirm password')
    .oneOf([Yup.ref('password')], 'Passwords must match'),
});

function Register() {
  useEffect(() => { document.title = 'Hercules — Create account'; }, []);

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { mode } = useContext(DarkModeContext);
  const theme = createTheme({ colorSchemes: { dark: mode === 'dark' } });

  const formik = useFormik({
    initialValues: { username: '', password: '', confirmPassword: '' },
    validationSchema,
    onSubmit: async (values) => {
      setLoading(true);
      try {
        await axios.post(endpoints.auth.register, {
          username: values.username.trim(),
          password: values.password,
        });
        toast.success('Account created. You can now sign in.', { theme: 'dark' });
        navigate('/login');
      } catch (error) {
        const msg = error.response?.data?.error || error.message || 'Registration failed. Please try again.';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
  });

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

        <div className="relative z-10 w-full max-w-[400px] mx-4 animate-scale-in">
          <div className="text-center mb-8">
            <img
              src={HerculesNewLogo}
              alt="HERCULES"
              className="h-14 w-auto mx-auto mb-5 dark:[filter:brightness(0)_invert(1)_brightness(0.85)]"
            />
            <h1 className="text-xl font-bold text-[#0f1729] dark:text-[#e8edf5] tracking-tight">
              Create account
            </h1>
            <p className="text-[13px] text-[#64748b] dark:text-[#556677] mt-1">
              Sign up to access the control panel
            </p>
          </div>

          <div
            className="bg-white/90 dark:bg-[#091422]/95 rounded-xl border border-black/[0.08] dark:border-[#22d3ee]/25 p-6 shadow-xl dark:shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(34,211,238,0.12)]"
          >
            <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b] dark:text-[#22d3ee]/50 mb-1.5 block">
                  Username
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] dark:text-[#556677]" />
                  <input
                    type="text"
                    name="username"
                    value={formik.values.username}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Choose a username"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#f8f9fb] dark:bg-[#080d19] border text-[13px] text-[#0f1729] dark:text-[#e8edf5] placeholder:text-[#94a3b8] dark:placeholder:text-[#445566] outline-none transition-all duration-200 ${
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
                  Password
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] dark:text-[#556677]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Choose a password (min 2 characters)"
                    className={`w-full pl-9 pr-10 py-2.5 rounded-lg bg-[#f8f9fb] dark:bg-[#080d19] border text-[13px] text-[#0f1729] dark:text-[#e8edf5] placeholder:text-[#94a3b8] dark:placeholder:text-[#445566] outline-none transition-all duration-200 ${
                      formik.touched.password && formik.errors.password
                        ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20'
                        : 'border-black/[0.08] dark:border-[#22d3ee]/10 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)] dark:focus:border-[#22d3ee]/40 dark:focus:ring-[#22d3ee]/15'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] dark:text-[#556677] dark:hover:text-[#8899ab] transition-colors"
                  >
                    {showPassword ? <AiOutlineEyeInvisible size={16} /> : <AiOutlineEye size={16} />}
                  </button>
                </div>
                {formik.touched.password && formik.errors.password && (
                  <p className="text-[11px] text-red-500 mt-1">{formik.errors.password}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b] dark:text-[#22d3ee]/50 mb-1.5 block">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] dark:text-[#556677]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formik.values.confirmPassword}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Confirm password"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#f8f9fb] dark:bg-[#080d19] border text-[13px] text-[#0f1729] dark:text-[#e8edf5] placeholder:text-[#94a3b8] dark:placeholder:text-[#445566] outline-none transition-all duration-200 ${
                      formik.touched.confirmPassword && formik.errors.confirmPassword
                        ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20'
                        : 'border-black/[0.08] dark:border-[#22d3ee]/10 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)] dark:focus:border-[#22d3ee]/40 dark:focus:ring-[#22d3ee]/15'
                    }`}
                  />
                </div>
                {formik.touched.confirmPassword && formik.errors.confirmPassword && (
                  <p className="text-[11px] text-red-500 mt-1">{formik.errors.confirmPassword}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 rounded-lg bg-gradient-to-r from-[var(--brand)] to-[#0284c7] dark:from-[#0e7490] dark:to-[#22d3ee] text-white text-[13px] font-semibold shadow-lg shadow-[var(--brand)]/20 dark:shadow-[#22d3ee]/10 hover:shadow-xl transition-all duration-300 hover:translate-y-[-1px] active:translate-y-0 disabled:opacity-60 disabled:pointer-events-none"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <p className="text-center text-[12px] text-[#64748b] dark:text-[#556677] mt-4">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-[var(--brand)] dark:text-[#22d3ee] hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>

          <p className="text-center text-[10px] text-[#94a3b8] dark:text-[#445566] mt-6 tracking-[0.15em] uppercase font-semibold">
            Hercules v2 Industrial SCADA
          </p>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default Register;
