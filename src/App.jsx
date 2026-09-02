import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { navConfig } from './config/navigation';
import ProtectedRoute from './components/common/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';

// Helper component: redirects authenticated user away from login page to dashboard
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
    return <Navigate to="/dashboard" replace />;
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
              {/* Default redirect to /dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* Dynamically register all pages defined in navConfig */}
              {navConfig.map((item) => {
                const Component = item.component;
                return (
                  <Route
                    key={item.id}
                    path={item.path}
                    element={<Component />}
                  />
                );
              })}
            </Route>
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
