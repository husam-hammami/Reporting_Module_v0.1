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
import ShiftsSettings from '../Pages/Settings/Shifts/ShiftsSettings';
import UserManagement from '../Pages/Settings/Users/UserManagement';
import LicenseActivations from '../Pages/Settings/LicenseActivations/LicenseActivations';
import BrandingSettings from '../Pages/Settings/Branding/BrandingSettings';
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
          <Route
            path="report-builder/:id/paginated"
            element={
              <ProtectedRoute roles={[Roles.Admin, Roles.Manager, Roles.Operator]}>
                <PaginatedReportBuilder />
              </ProtectedRoute>
            }
          />

          {/* Settings Routes */}
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
            <Route path="system" element={<SystemSettings />} />
            <Route path="distribution" element={<ReportDistribution />} />
            <Route path="shifts" element={<ShiftsSettings />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="branding" element={<BrandingSettings />} />
            <Route path="license-activations" element={<LicenseActivations />} />
          </Route>
        </Route>

        <Route path="/404" element={<div>Not found</div>} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </div>
  );
};

export default AppRoutes;
