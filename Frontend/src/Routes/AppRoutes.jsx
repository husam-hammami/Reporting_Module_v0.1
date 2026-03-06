import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedCredentials, ProtectedRoute } from './ProtectedRoute';
import { Roles } from '../Data/Roles';

// Lazy-loaded page components
const Home = lazy(() => import('../Pages/Home'));
const Login = lazy(() => import('../Pages/Login'));
const SettingsHome = lazy(() => import('../Pages/Settings/SettingsHome'));
const TagManager = lazy(() => import('../Pages/Settings/Tags/TagManager'));
const TagGroupManager = lazy(() => import('../Pages/Settings/TagGroups/TagGroupManager'));
const MappingManager = lazy(() => import('../Pages/Settings/Mappings/MappingManager'));
const ExportImport = lazy(() => import('../Pages/Settings/ExportImport/ExportImport'));
const SystemSettings = lazy(() => import('../Pages/Settings/System/SystemSettings'));
const LiveMonitorLayoutManager = lazy(() => import('../Pages/LiveMonitor/Layouts/LiveMonitorLayoutManager'));
const LiveMonitorSectionEditor = lazy(() => import('../Pages/LiveMonitor/Layouts/LiveMonitorSectionEditor'));
const LiveMonitorTableSectionEditor = lazy(() => import('../Pages/LiveMonitor/Layouts/Sections/LiveMonitorTableSectionEditor'));
const LiveMonitorChartSectionEditor = lazy(() => import('../Pages/LiveMonitor/Layouts/Sections/LiveMonitorChartSectionEditor'));
const KPICardsEditor = lazy(() => import('../Pages/LiveMonitor/Layouts/Sections/KPICardsEditor'));
const DynamicLiveMonitor = lazy(() => import('../Pages/LiveMonitor/DynamicLiveMonitor'));
const LayoutManager = lazy(() => import('../Pages/LiveMonitor/LayoutManager'));
const ReportBuilderManager = lazy(() => import('../Pages/ReportBuilder/ReportBuilderManager'));
const ReportBuilderCanvas = lazy(() => import('../Pages/ReportBuilder/ReportBuilderCanvas'));
const ReportBuilderPreview = lazy(() => import('../Pages/ReportBuilder/ReportBuilderPreview'));
const ReportViewer = lazy(() => import('../Pages/Reports/ReportViewer'));
const FormulaManager = lazy(() => import('../Pages/Settings/Formulas/FormulaManager'));
const EmailSettings = lazy(() => import('../Pages/Settings/Email/EmailSettings'));
const ShiftsSettings = lazy(() => import('../Pages/Settings/Shifts/ShiftsSettings'));
const UserManagement = lazy(() => import('../Pages/Settings/Users/UserManagement'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const AppRoutes = () => {
  const location = useLocation();
  return (
    <div className="mx-auto">
      <Suspense fallback={<PageLoader />}>
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
              element={<Navigate to="/report-builder" replace />}
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

            {/* Report Builder Routes */}
            <Route
              path="report-builder"
              element={
                <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                  <ReportBuilderManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="report-builder/:id"
              element={
                <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                  <ReportBuilderCanvas />
                </ProtectedRoute>
              }
            />
            <Route
              path="report-builder/:id/preview"
              element={
                <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                  <ReportBuilderPreview />
                </ProtectedRoute>
              }
            />

            {/* Settings Routes */}
            <Route
              path="settings"
              element={
                <ProtectedRoute roles={[Roles.Admin, Roles.Manager]}>
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
              <Route path="system" element={<SystemSettings />} />
              <Route path="email" element={<EmailSettings />} />
              <Route path="shifts" element={<ShiftsSettings />} />
              <Route path="users" element={<UserManagement />} />
            </Route>
          </Route>

          <Route path="/404" element={<div>Not found</div>} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
};

export default AppRoutes;
