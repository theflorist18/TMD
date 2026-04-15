import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './auth/AuthContext';
import { HoldersDatasetProvider } from './context/HoldersDatasetContext';
import { AccessPage } from './pages/AccessPage';
import { HomePage } from './pages/HomePage';
import { ExplorerPage } from './pages/ExplorerPage';
import { HoldingsPage } from './pages/HoldingsPage';
import { MarketPage } from './pages/MarketPage';

const IntelligencePage = lazy(() =>
  import('./pages/IntelligencePage').then((m) => ({ default: m.IntelligencePage }))
);

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/access" element={<AccessPage />} />
          <Route
            element={
              <HoldersDatasetProvider>
                <Layout />
              </HoldersDatasetProvider>
            }
          >
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/explorer"
              element={
                <ProtectedRoute>
                  <ExplorerPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/holdings"
              element={
                <ProtectedRoute>
                  <HoldingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market"
              element={
                <ProtectedRoute>
                  <MarketPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/intelligence"
              element={
                <ProtectedRoute>
                  <Suspense
                    fallback={
                      <div className="page-content">
                        <div className="widget-placeholder">
                          <div className="spinner" />
                        </div>
                      </div>
                    }
                  >
                    <IntelligencePage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
