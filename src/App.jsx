import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Payables from '@/pages/Payables';
import Receivables from '@/pages/Receivables';
import Reports from '@/pages/Reports';
import WhatsAppInput from '@/pages/WhatsAppInput';
import Settings from '@/pages/Settings';
import Hospitals from '@/pages/Hospitals';
import CalendarPage from '@/pages/CalendarPage';
import Recurrences from '@/pages/Recurrences';
import CardInvoices from '@/pages/CardInvoices';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/lancamentos" element={<Transactions />} />
        <Route path="/contas-pagar" element={<Payables />} />
        <Route path="/contas-receber" element={<Receivables />} />
        <Route path="/relatorios" element={<Reports />} />
        <Route path="/whatsapp" element={<WhatsAppInput />} />
        <Route path="/configuracoes" element={<Settings />} />
        <Route path="/hospitais" element={<Hospitals />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/recorrencias" element={<Recurrences />} />
        <Route path="/faturas-cartao" element={<CardInvoices />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App