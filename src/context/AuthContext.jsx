import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);
const STORAGE_KEY = 'refrasynth_auth_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on app load
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to parse auth token from localStorage', e);
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  // Login handler
  const login = async (username, password) => {
    try {
      const res = await api.login(username, password);
      if (res && res.success && res.user) {
        setUser(res.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(res.user));
        return { success: true };
      }
      return {
        success: false,
        message: res?.message || 'Invalid credentials or connection issue.',
      };
    } catch (err) {
      return {
        success: false,
        message: err.message || 'Login failed. Please check connection.',
      };
    }
  };

  // Logout handler
  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isMockMode: api.isMockMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
