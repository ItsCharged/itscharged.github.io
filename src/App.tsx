import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PublicRequestPage } from './pages/PublicRequestPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { HiddenLoginModal } from './components/HiddenLoginModal';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuth = sessionStorage.getItem('dj_auth') === 'true';
  if (!isAuth) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <HiddenLoginModal />
      <Routes>
        <Route path="/" element={<PublicRequestPage />} />
        <Route 
          path="/dj-dashboard" 
          element={
            <ProtectedRoute>
              <AdminDashboardPage />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;