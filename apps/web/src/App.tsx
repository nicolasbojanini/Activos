import { Navigate, Route, Routes } from 'react-router';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ClienteGate } from './components/ClienteGate';
import { Login } from './pages/Login';
import { Auditorias } from './pages/Auditorias';
import { Importar } from './pages/Importar';
import { ActivoDetalle } from './pages/ActivoDetalle';
import { Reportes } from './pages/Reportes';
import { Auditores } from './pages/Auditores';
import { Clientes } from './pages/Clientes';
import { ConfigurarCampos } from './pages/ConfigurarCampos';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/auditores" element={<Auditores />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:clienteId/campos" element={<ConfigurarCampos />} />
        <Route element={<ClienteGate />}>
          <Route path="/auditorias" element={<Auditorias />} />
          <Route path="/auditorias/:proyectoId/importar" element={<Importar />} />
          <Route path="/activos/:id" element={<ActivoDetalle />} />
          <Route path="/reportes" element={<Reportes />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/auditorias" replace />} />
    </Routes>
  );
}

export default App;
