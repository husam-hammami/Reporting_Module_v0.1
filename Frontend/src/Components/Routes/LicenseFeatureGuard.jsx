import { Navigate } from 'react-router-dom';
import { useLicenseFeatures } from '../../Context/LicenseFeaturesProvider';

/**
 * Redirect when a licensed module is disabled for this machine.
 * @param {string} featureKey - 'atlas_ai' | 'digital_twin'
 */
export default function LicenseFeatureGuard({ featureKey, children }) {
  const { hasFeature, loading } = useLicenseFeatures();

  if (!loading && featureKey && !hasFeature(featureKey)) {
    return <Navigate to="/reports" replace />;
  }

  return children;
}
