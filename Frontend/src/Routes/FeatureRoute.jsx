import { Navigate } from 'react-router-dom';
import { useFeatures } from '../Context/FeatureContext';
import LoadingScreen from '../Components/Common/LoadingScreen';

/**
 * Blocks routes when a licensed module is disabled for this machine.
 * feature: 'digital_twin' | 'atlas_ai'
 */
export function FeatureRoute({ feature, children, redirectTo = '/reports' }) {
  const { features, loading } = useFeatures();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!features[feature]) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
