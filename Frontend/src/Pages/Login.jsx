import {
  Box,
  createTheme,
  styled,
  ThemeProvider,
  TextField,
  Button,
  Typography,
  Paper,
  InputAdornment,
  IconButton,
} from '@mui/material';
import SideNav from '../Components/Common/SideNav';
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
import useLoading from '../Hooks/useLoading';
import { AiOutlineEye, AiOutlineEyeInvisible } from 'react-icons/ai';

const validationSchema = Yup.object({
  username: Yup.string().required('Username is required'),
  password: Yup.string()
    .required('Password is required')
    .min(2, 'Password must be at least 2 characters long'),
});

function Login() {
  useEffect(() => { document.title = 'Login'; }, []);

  // const loading = useLoading();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const { setAuth, setAuthLoading } = useContext(AuthContext);

  const loginUser = async values => {
    console.log('🔐 [Login] Starting login process for user:', values.username);
    setLoading(true);
    try {
      const loginUrl = `${axios.defaults.baseURL}${endpoints.auth.login}`;
      console.log('📡 [Login] Making POST request to:', loginUrl);
      console.log('📦 [Login] Request payload:', { username: values.username, password: '***' });

      const response = await axios.post(endpoints.auth.login, values, { withCredentials: true });
      console.log('✅ [Login] Login response received:', response.status, response.data);

      if (response.status === 200 && response.data?.user_data) {
        toast.success('Logged in!..', { theme: 'dark' });
        const userData = response.data.user_data;
        setAuth(userData);
        if (userData?.auth_token) {
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, userData.auth_token);
          } catch (_) {}
        }
        setAuthLoading(false);
        console.log('✅ [Login] User validated from response, navigating to home...');
        navigate('/');
      }
    } catch (error) {
      console.error('❌ [Login] Login error:', error);
      console.error('❌ [Login] Error details:', {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        status: error.response?.status,
        timeout: error.code === 'ECONNABORTED' || error.message?.includes('timeout')
      });

      // Better error message handling
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
        errorMessage = 'Cannot connect to server. Please check if the backend is running on port 5000.';
      }

      toast.error(errorMessage);
    } finally {
      console.log('🏁 [Login] Login process complete');
      setLoading(false);
    }
  };

  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  const formik = useFormik({
    initialValues: {
      username: '',
      password: '',
    },
    validationSchema,
    onSubmit: values => {
      loginUser(values);
    },
  });

  const { mode } = useContext(DarkModeContext);

  const DrawerHeader = styled('div')(({ theme }) => ({
    // necessary for content to be below app bar
    ...theme.mixins.toolbar,
  }));

  const theme = createTheme({
    colorSchemes: {
      dark: mode === 'dark' ? true : false,
    },
  });

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <>
      <Box sx={{ display: 'flex' }}>
        <Navbar />
        {loading && <LoadingScreen />}
        <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
          <DrawerHeader />

          <ThemeProvider theme={theme}>
            <div className="Login container mx-auto 2xl:mt-10 mt-10">
              {!loading && (
                <Paper elevation={3} className="p-6 mx-auto w-3/4">
                  <Box textAlign="center" mb={4}>
                    <Typography variant="h4" className="font-bold">
                      Login
                    </Typography>
                    <Typography variant="body2" className="mt-2">
                      Enter your credentials to access your account
                    </Typography>
                  </Box>
                  <form
                    onSubmit={formik.handleSubmit}
                    className="flex flex-col gap-4"
                  >
                    {/* Username */}
                    <TextField
                      fullWidth
                      label="Username"
                      variant="outlined"
                      name="username"
                      value={formik.values.username}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      error={
                        formik.touched.username &&
                        Boolean(formik.errors.username)
                      }
                      helperText={
                        formik.touched.username && formik.errors.username
                      }
                    />

                    {/* Password */}
                    <TextField
                      fullWidth
                      label="Password"
                      variant="outlined"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formik.values.password}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      error={
                        formik.touched.password &&
                        Boolean(formik.errors.password)
                      }
                      helperText={
                        formik.touched.password && formik.errors.password
                      }
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={togglePasswordVisibility}
                              edge="end"
                            >
                              {showPassword ? (
                                <AiOutlineEyeInvisible />
                              ) : (
                                <AiOutlineEye />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      fullWidth
                      variant="contained"
                      color="primary"
                      className="!py-3 mt-4 !mx-auto !w-1/3"
                    >
                      Login
                    </Button>

                  </form>
                </Paper>
              )}
            </div>
          </ThemeProvider>
        </Box>
      </Box>
    </>
  );
}
export default Login;
