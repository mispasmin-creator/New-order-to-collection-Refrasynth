import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { navConfig } from './config/navigation';
import { getFirstAllowedPath } from './utils/permissions';
import ProtectedRoute from './components/common/ProtectedRoute';
import RequirePagePermission from './components/common/RequirePagePermission';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';

// Lands the user on the first page their Page Permissions actually allow,
// instead of a hardcoded route they may not have access to.
function DefaultRedirect() {
  const { user } = useAuth();
  const target = getFirstAllowedPath(user, navConfig) || '/dashboard';
  return <Navigate to={target} replace />;
}

// Helper component: redirects authenticated user away from login page to their landing page
function PublicLoginRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (user) {
    return <DefaultRedirect />;
  }

  return <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Login Route */}
          <Route path="/login" element={<PublicLoginRoute />} />

          {/* Protected Application Routes (Driven by navConfig) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              {/* Default redirect to the user's first permitted page */}
              <Route path="/" element={<DefaultRedirect />} />

              {/* Dynamically register all pages defined in navConfig, each
                  gated by the logged-in user's Page Permissions */}
              {navConfig.map((item) => {
                const Component = item.component;
                return (
                  <Route
                    key={item.id}
                    path={item.path}
                    element={
                      <RequirePagePermission label={item.label}>
                        <Component />
                      </RequirePagePermission>
                    }
                  />
                );
              })}
            </Route>
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
