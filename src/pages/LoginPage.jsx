import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, User, Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, isMockMode } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both Username and Password.');
      return;
    }

    setIsSubmitting(true);
    const res = await login(username.trim(), password);
    setIsSubmitting(false);

    if (res.success) {
      navigate('/dashboard', { replace: true });
    } else {
      setError(res.message || 'Login failed. Please verify credentials.');
    }
  };

  const handleFillDemo = (demoUser, demoPass) => {
    setUsername(demoUser);
    setPassword(demoPass);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative ambient background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Logo & Title */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-indigo-500/30 p-1.5">
            <img src="/icons.png" alt="Refrasynth" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white m-0">Refrasynth</h1>
            <p className="text-xs text-indigo-200 tracking-wider uppercase font-medium">Order-to-Collection Portal</p>
          </div>
        </div>

        <h2 className="mt-6 text-center text-xl font-semibold text-slate-200">
          Sign in to your account
        </h2>
        <p className="mt-1 text-center text-sm text-slate-400">
          Backend connected via Google Sheets & Apps Script
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-white/95 backdrop-blur-md py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-white/20">
          
          {/* Status Badge */}
          <div className="mb-6 flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-500 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isMockMode ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}`} />
              Backend: {isMockMode ? 'Local / Demo Mode' : 'Live Google Sheet'}
            </span>
            <span className="font-mono text-slate-400 text-[11px]">v1.0</span>
          </div>

          {error && (
            <div className="mb-5 rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-sm text-rose-700 flex items-start gap-2">
              <span className="font-semibold">Error:</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username (e.g. admin)"
                  required
                  autoFocus
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-50/50 border border-slate-300 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-50/50 border border-slate-300 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-all"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing In...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials helper */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Quick Test Credentials:
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleFillDemo('admin', 'admin')}
                className="text-left p-2 rounded-lg bg-indigo-50/60 hover:bg-indigo-100/70 border border-indigo-100 transition-colors text-xs"
              >
                <div className="font-medium text-indigo-900">Admin Account</div>
                <div className="text-[11px] text-indigo-600">user: <strong>admin</strong></div>
              </button>
              <button
                type="button"
                onClick={() => handleFillDemo('rajesh', 'password123')}
                className="text-left p-2 rounded-lg bg-slate-100/70 hover:bg-slate-200/70 border border-slate-200 transition-colors text-xs"
              >
                <div className="font-medium text-slate-800">Operations</div>
                <div className="text-[11px] text-slate-500">user: <strong>rajesh</strong></div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
