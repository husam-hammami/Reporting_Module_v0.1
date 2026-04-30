import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Home from '../Pages/Home';
import Login from '../Pages/Login';
import { ProtectedCredentials, ProtectedRoute } from './ProtectedRoute';
import { Roles } from '../Data/Roles';
import SettingsHome from '../Pages/Settings/SettingsHome';
import TagManager from '../Pages/Settings/Tags/TagManager';
import TagGroupManager from '../Pages/Settings/TagGroups/TagGroupManager';
import MappingManager from '../Pages/Settings/Mappings/MappingManager';
import ExportImport from '../Pages/Settings/ExportImport/ExportImport';
import SystemSettings from '../Pages/Settings/System/SystemSettings';
import LiveMonitorLayoutManager from '../Pages/LiveMonitor/Layouts/LiveMonitorLayoutManager';
import LiveMonitorSectionEditor from '../Pages/LiveMonitor/Layouts/LiveMonitorSectionEditor';
import LiveMonitorTableSectionEditor from '../Pages/LiveMonitor/Layouts/Sections/LiveMonitorTableSectionEditor';
import LiveMonitorChartSectionEditor from '../Pages/LiveMonitor/Layouts/Sections/LiveMonitorChartSectionEditor';
import KPICardsEditor from '../Pages/LiveMonitor/Layouts/Sections/KPICardsEditor';
import DynamicLiveMonitor from '../Pages/LiveMonitor/DynamicLiveMonitor';
import LayoutManager from '../Pages/LiveMonitor/LayoutManager';
import ReportBuilderManager from '../Pages/ReportBuilder/ReportBuilderManager';
import ReportBuilderCanvas from '../Pages/ReportBuilder/ReportBuilderCanvas';
import ReportBuilderPreview from '../Pages/ReportBuilder/ReportBuilderPreview';
import PaginatedReportBuilder from '../Pages/ReportBuilder/PaginatedReportBuilder';
import ReportViewer, { DashboardViewer, TableReportViewer } from '../Pages/Reports/ReportViewer';
import FormulaManager from '../Pages/Settings/Formulas/FormulaManager';
import ReportDistribution from '../Pages/Settings/ReportDistribution/ReportDistribution';
import DistributionPage from '../Pages/Distribution/DistributionPage';
import ShiftsSettings from '../Pages/Settings/Shifts/ShiftsSettings';
import UserManagement from '../Pages/Settings/Users/UserManagement';
import LicenseActivations from '../Pages/Settings/LicenseActivations/LicenseActivations';
import BrandingSettings from '../Pages/Settings/Branding/BrandingSettings';
import SoftwareUpdates from '../Pages/AppSettings/SoftwareUpdates';
import ProfilePage from '../Pages/Profile/ProfilePage';
import MyAccount from '../Pages/Profile/MyAccount';
import AppSettingsPage from '../Pages/AppSettings/AppSettingsPage';
import SystemLogs from '../Pages/Settings/Logs/SystemLogs';
import HerculesAISetup from '../Pages/HerculesAI/HerculesAISetup';
import HerculesAISettingsPage from '../Pages/HerculesAI/SettingsPage';
import JobLogsPage from '../Pages/JobLogs/JobLogsPage';
import DigitalTwinPage from '../Pages/DigitalTwin/DigitalTwinPage';
import { useContext } from 'react';
import { AuthContext } from '../Context/AuthProvider';

function DefaultRedirect() {
  const { auth } = useContext(AuthContext);
  const target = auth?.role === Roles.Operator ? '/reports' : '/report-builder';
  return <Navigate to={target} replace />;
}

const AppRoutes = () => {
  const location = useLocation();
  return (
    <div className="mx-auto">
      <Routes location={location}>
        <Route
          path="/login"
          element={
            <ProtectedCredentials>
              <Login />
            </ProtectedCredentials>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={<DefaultRedirect />}
          />

          {/* Live Monitor Routes */}
          <Route
            path="live-monitor/dynamic"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <DynamicLiveMonitor />
              </ProtectedRoute>
            }
          />
          <Route
            path="live-monitor/layouts"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <LiveMonitorLayoutManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="live-monitor/layouts-manager"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <LayoutManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="live-monitor/layouts/:id"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <LiveMonitorSectionEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="live-monitor/layouts/:id/sections/:sectionId"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <LiveMonitorTableSectionEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="live-monitor/layouts/:id/sections/:sectionId/kpi"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <KPICardsEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="live-monitor/layouts/:id/sections/:sectionId/chart"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <LiveMonitorChartSectionEditor />
              </ProtectedRoute>
            }
          />

          {/* Reporting — view built reports with live/historical data */}
          <Route
            path="reporting"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <ReportViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="reporting/:id"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <ReportViewer />
              </ProtectedRoute>
            }
          />

          {/* Dashboards — released dashboard reports */}
          <Route
            path="dashboards"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <DashboardViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="dashboards/:id"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <DashboardViewer />
              </ProtectedRoute>
            }
          />

          {/* Table Reports — released paginated reports */}
          <Route
            path="reports"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <TableReportViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/:id"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <TableReportViewer />
              </ProtectedRoute>
            }
          />

          {/* Job Logs — order-based production reports */}
          <Route
            path="job-logs"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <JobLogsPage />
              </ProtectedRoute>
            }
          />

          {/* Distribution */}
          <Route
            path="distribution"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager]}>
                <DistributionPage />
              </ProtectedRoute>
            }
          />

          {/* Hercules AI */}
          <Route
            path="hercules-ai"
            element={
              <ProtectedRoute roles={[Roles.Admin]}>
                <HerculesAISetup />
              </ProtectedRoute>
            }
          />
          {/* Hercules AI — Settings (Plan 6 §11 — dedicated route) */}
          <Route
            path="hercules-ai/settings"
            element={
              <ProtectedRoute roles={[Roles.Admin]}>
                <HerculesAISettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Digital Twin — 3D plant view (Salalah Mill B) */}
          <Route
            path="digital-twin"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <DigitalTwinPage />
              </ProtectedRoute>
            }
          />

          {/* Report Builder Routes */}
          <Route
            path="report-builder"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager]}>
                <ReportBuilderManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="report-builder/:id"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager]}>
                <ReportBuilderCanvas />
              </ProtectedRoute>
            }
          />
          <Route
            path="report-builder/:id/preview"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager]}>
                <ReportBuilderPreview />
              </ProtectedRoute>
            }
          />
          <Route
            path="report-builder/:id/paginated"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager]}>
                <PaginatedReportBuilder />
              </ProtectedRoute>
            }
          />

          {/* Engineering Routes */}
          <Route
            path="settings"
            element={
              <ProtectedRoute roles={[Roles.SuperAdmin, Roles.Admin, Roles.Manager]}>
                <SettingsHome />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/settings/tags" replace />} />
            <Route path="tags" element={<TagManager />} />
            <Route path="tag-groups" element={<TagGroupManager />} />
            <Route path="formulas" element={<FormulaManager />} />
            <Route path="mappings" element={<MappingManager />} />
            <Route path="export-import" element={<ExportImport />} />
            <Route path="distribution" element={<ReportDistribution />} />
            <Route path="shifts" element={<ShiftsSettings />} />
            <Route path="branding" element={<BrandingSettings />} />
          </Route>

          {/* Profile Routes */}
          <Route
            path="profile"
            element={
              <ProtectedRoute roles={[Roles.SuperAdmin, Roles.Admin, Roles.Manager, Roles.Operator]}>
                <ProfilePage />
              </ProtectedRoute>
            }
          >
            <Route index element={<MyAccount />} />
            <Route path="users" element={<UserManagement />} />
          </Route>

          {/* App Settings Routes */}
          <Route
            path="app-settings"
            element={
              <ProtectedRoute roles={[Roles.SuperAdmin, Roles.Admin]}>
                <AppSettingsPage />
              </ProtectedRoute>
            }
          >
            <Route index element={<SystemSettings />} />
            <Route path="logs" element={<SystemLogs />} />
            <Route path="licenses" element={<LicenseActivations />} />
            <Route path="updates" element={<SoftwareUpdates />} />
          </Route>
        </Route>

        <Route path="/404" element={<div>Not found</div>} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </div>
  );
};

export default AppRoutes;
