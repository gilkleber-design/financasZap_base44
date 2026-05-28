export function resolveHospitalPaymentModel(hospital) {
  if (hospital?.payment_model) return hospital.payment_model;
  if (hospital?.remuneration_model === 'producao') return 'so_producao';
  if (hospital?.has_productivity) return 'plantao_producao';
  return 'so_plantao';
}

export function getHospitalConfigError(hospital, shiftDate, type) {
  const paymentModel = resolveHospitalPaymentModel(hospital);
  if (paymentModel === 'so_producao') return null;

  const date = new Date(`${shiftDate}T12:00:00`);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  const fieldMap = {
    SD: isWeekend ? 'valor_sd_fds' : 'valor_sd_semana',
    SN: isWeekend ? 'valor_sn_fds' : 'valor_sn_semana',
    SA: 'valor_sobreaviso',
  };

  const field = fieldMap[type];
  const value = hospital?.[field];

  if (!field) return 'Tipo de plantão inválido.';
  if (!value || Number(value) <= 0) {
    return `Falta configurar ${field} do hospital ${hospital?.name || ''}`.trim();
  }

  return null;
}

export function calculateShiftValue({ hospital, shiftDate, type, isTurno = false }) {
  const paymentModel = resolveHospitalPaymentModel(hospital);
  if (paymentModel === 'so_producao') {
    return { value: 0, error: null, paymentModel };
  }

  const error = getHospitalConfigError(hospital, shiftDate, type);
  if (error) {
    return { value: null, error, paymentModel };
  }

  const date = new Date(`${shiftDate}T12:00:00`);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  const baseMap = {
    SD: isWeekend ? Number(hospital?.valor_sd_fds) : Number(hospital?.valor_sd_semana),
    SN: isWeekend ? Number(hospital?.valor_sn_fds) : Number(hospital?.valor_sn_semana),
    SA: Number(hospital?.valor_sobreaviso),
  };

  const base = baseMap[type];
  return {
    value: isTurno ? base / 2 : base,
    error: null,
    paymentModel,
  };
}

export function calcLiquido(bruto, source) {
  const taxRate = Number(source?.default_tax_rate || 0);
  return taxRate > 0 ? bruto * (1 - taxRate / 100) : bruto;
}