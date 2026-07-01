import { Navigate, Route, Routes } from 'react-router';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Auditorias } from './pages/Auditorias';
import { Importar } from './pages/Importar';
import { ActivoDetalle } from './pages/ActivoDetalle';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/auditorias" element={<Auditorias />} />
        <Route path="/auditorias/:proyectoId/importar" element={<Importar />} />
        <Route path="/activos/:id" element={<ActivoDetalle />} />
      </Route>
      <Route path="*" element={<Navigate to="/auditorias" replace />} />
    </Routes>
  );
}

export default App;
