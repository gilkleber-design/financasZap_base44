import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Purchases from '@/pages/Purchases';
import Payables from '@/pages/Payables';
import Receivables from '@/pages/Receivables';
import Recebimentos from '@/pages/Recebimentos';
import Reports from '@/pages/Reports';
import WhatsAppInput from '@/pages/WhatsAppInput';
import Settings from '@/pages/Settings';
import Hospitals from '@/pages/Hospitals';
import CalendarPage from '@/pages/CalendarPage';
import CardInvoices from '@/pages/CardInvoices';
import Planning from '@/pages/Planning';
import LinkHub from '@/pages/LinkHub';
import DataReview from '@/pages/DataReview';
import RecurringIncomes from '@/pages/RecurringIncomes';

const routeTitles = {
  '/': 'Início — FinançasZap',
  '/receitas-recorrentes': 'Receitas Recorrentes — FinançasZap',
  '/relatorios': 'Relatórios — FinançasZap',
  '/hospitais': 'Hospitais — FinançasZap',
  '/calendario': 'Calendário — FinançasZap',
  '/planejamento': 'Planejamento — FinançasZap',
  '/revisao-dados': 'Revisão de Dados — FinançasZap',
  '/transacoes': 'Transações — FinançasZap',
  '/compras': 'Compras do Mês — FinançasZap',
  '/contas-pagar': 'Contas a Pagar — FinançasZap',
  '/contas-receber': 'Contas a Receber — FinançasZap',
  '/recebimentos': 'Recebíveis — FinançasZap',
  '/configuracoes': 'Configurações — FinançasZap',
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  document.title = routeTitles[location.pathname] || 'FinançasZap';

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
        <Route path="/transacoes" element={<Transactions />} />
        <Route path="/compras" element={<Purchases />} />
        <Route path="/contas-pagar" element={<Payables />} />
        <Route path="/contas-receber" element={<Receivables />} />
        <Route path="/recebimentos" element={<Recebimentos />} />
        <Route path="/relatorios" element={<Reports />} />
        <Route path="/whatsapp" element={<WhatsAppInput />} />
        <Route path="/configuracoes" element={<Settings />} />
        <Route path="/hospitais" element={<Hospitals />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/faturas-cartao" element={<CardInvoices />} />
        <Route path="/planejamento" element={<Planning />} />
        <Route path="/revisao-dados" element={<DataReview />} />
        <Route path="/hub-amarracao" element={<LinkHub />} />
        <Route path="/receitas-recorrentes" element={<RecurringIncomes />} />
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
        <SonnerToaster richColors position="top-center" />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App