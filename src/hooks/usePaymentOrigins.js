import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Retorna uma lista unificada de origens de pagamento (Contas + Cartões ativos).
 * Cada item tem: { id, label, type: 'account' | 'card', raw }
 */
export function usePaymentOrigins() {
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: () => base44.entities.Card.list(),
  });

  const origins = accounts
    .filter(a => a.active !== false)
    .map(a => ({
      id: a.id,
      label: `${a.name}${a.bank ? ' — ' + a.bank : ''}`,
      type: 'account',
      raw: a,
    }));

  return { origins, accounts, cards };
}