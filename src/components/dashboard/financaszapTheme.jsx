export const formatCurrency = (value, digits = 0) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(Number(value || 0));

export const formatCompactCurrency = (value) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000) {
    return `R$ ${(amount / 1000).toFixed(1)}k`;
  }
  return formatCurrency(amount, 2);
};

export const normalizeCategoryLabel = (slug) => {
  const map = {
    passivos_de_transicao: 'Passivos de Transição',
    funcionarios: 'Funcionários',
    familia: 'Família',
    impostos_taxas: 'Impostos e Taxas',
    alimentacao: 'Alimentação',
    'alimentação': 'Alimentação',
    moradia: 'Moradia',
    transporte: 'Transporte',
    saude: 'Saúde',
    educacao: 'Educação',
    lazer: 'Lazer',
    vestuario: 'Vestuário',
    servicos: 'Serviços',
    investimentos: 'Investimentos',
    outros: 'Outros',
    servicos_domesticos: 'Serviços Domésticos',
    assinaturas: 'Assinaturas',
  };

  if (!slug) return '—';
  const key = String(slug).toLowerCase().trim();
  return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const getDaysLate = (dateString) => {
  if (!dateString) return 0;
  const today = new Date();
  const target = new Date(`${dateString}T12:00:00`);
  const diff = Math.floor((today - target) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
};

export const getLateLabel = (days) => {
  if (days <= 0) return 'No prazo';
  return days === 1 ? '1 dia em atraso' : `${days} dias em atraso`;
};

export const getInitials = (name) => {
  if (!name) return 'DR';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
};