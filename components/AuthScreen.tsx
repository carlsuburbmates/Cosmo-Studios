import React, { useState } from "react";
import { User } from "../types";
import * as AuthService from "../services/authService";

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      let user;
      if (isLogin) {
        user = AuthService.login(email, password);
      } else {
        user = AuthService.signup(email, password);
      }
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-atelier-bg font-sans p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
            <div className="w-16 h-16 bg-atelier-ink rounded-lg flex items-center justify-center text-white font-bold text-4xl mx-auto mb-4">C</div>
            <h1 className="text-3xl font-bold tracking-[0.1em] uppercase text-atelier-ink">Cosmo Studio</h1>
            <p className="text-sm text-atelier-muted">Sign in to access your projects</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-8 border border-atelier-accent shadow-xl flex flex-col gap-4">
            <h2 className="text-lg font-bold text-center mb-2">{isLogin ? "Sign In" : "Create Account"}</h2>
            
            {error && (
                <div className="bg-red-100 border border-red-200 text-red-700 text-xs p-3 text-center font-bold">
                    {error}
                </div>
            )}

            <div>
                <label className="text-xs font-bold uppercase text-atelier-muted tracking-wider block mb-1">Email</label>
                <input 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full p-3 border border-atelier-accent bg-atelier-bg/50 focus:border-atelier-ink outline-none"
                />
            </div>

            <div>
                <label className="text-xs font-bold uppercase text-atelier-muted tracking-wider block mb-1">Password</label>
                <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full p-3 border border-atelier-accent bg-atelier-bg/50 focus:border-atelier-ink outline-none"
                />
            </div>

            <button type="submit" className="w-full bg-atelier-ink text-white py-4 text-sm font-bold uppercase tracking-widest hover:bg-atelier-active transition-colors mt-2">
                {isLogin ? "Sign In" : "Sign Up"}
            </button>

            <button type="button" onClick={() => { setIsLogin(!isLogin); setError(null); }} className="text-center text-xs text-atelier-muted hover:text-atelier-ink underline mt-4">
                {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
        </form>

        <div className="text-center mt-6">
            <p className="text-[10px] text-atelier-muted">
                Hint: Sign up with <strong>admin@cosmostudio.io</strong> for admin privileges.
            </p>
        </div>
      </div>
    </div>
  );
};