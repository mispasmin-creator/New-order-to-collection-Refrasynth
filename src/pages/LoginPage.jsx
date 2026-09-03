import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck, Workflow, PackageCheck } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
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

  const features = [
    { icon: Workflow, text: 'End-to-end Order to Collection workflow tracking' },
    { icon: PackageCheck, text: 'Live dispatch, logistics & kitting status in one place' },
    { icon: ShieldCheck, text: 'Secure, role-based access for every team member' },
  ];

  return (
    <div className="min-h-screen bg-white flex relative overflow-hidden">
      {/* Decorative soft ambient blobs (light, not dark) */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-100 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-[28rem] h-[28rem] bg-blue-50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 left-1/4 w-96 h-96 bg-slate-100 rounded-full blur-3xl pointer-events-none" />

      {/* Left branding panel (large screens only) */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-md shadow-slate-200 border border-slate-100 p-1.5">
            <img src="/icons.png" alt="Order To Collection" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-slate-800 text-lg tracking-tight">Order To Collection</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl xl:text-5xl font-bold text-slate-900 tracking-tight leading-tight mb-4">
            Manage your entire order journey in one place
          </h1>
          <p className="text-slate-500 text-base leading-relaxed mb-8">
            From dispatch planning to final collection — track every order, shipment and document without leaving your dashboard.
          </p>
          <div className="space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="text-sm text-slate-600 pt-1.5">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} Refrasynth. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile-only brand header */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-md shadow-slate-200 border border-slate-100 p-1.5">
              <img src="/icons.png" alt="Order To Collection" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-slate-800 text-lg tracking-tight">Order To Collection</span>
          </div>

          <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h2>
              <p className="mt-1 text-sm text-slate-500">Sign in to continue to your dashboard</p>
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
                <div className="relative rounded-lg">
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
                    className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative rounded-lg">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="block w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all"
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
                className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm shadow-indigo-200 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-all"
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

          </div>
        </div>
      </div>
    </div>
  );
}
