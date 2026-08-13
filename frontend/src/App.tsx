import { Navigate, Route, Routes } from "react-router-dom";
import { SignInPage } from "./pages/SignInPage";
import { PatientBookingPage } from "./pages/PatientBookingPage";
import { AdminSchedulePage } from "./pages/AdminSchedulePage";
import { useAuthStore } from "./store/authStore";

function RequireAuth({
  role,
  children,
}: {
  role?: "admin" | "patient";
  children: React.ReactNode;
}) {
  const token = useAuthStore((s) => s.token);
  const userRole = useAuthStore((s) => s.role);
  if (!token || !userRole) return <Navigate to="/signin" replace />;
  if (role && userRole !== role) {
    return <Navigate to={userRole === "admin" ? "/admin" : "/book"} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route
        path="/book"
        element={
          <RequireAuth role="patient">
            <PatientBookingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <AdminSchedulePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/signin" replace />} />
    </Routes>
  );
}
