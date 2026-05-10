/**
 * Calcula o 5º dia útil de um mês (segunda a sexta, excluindo sábados e domingos)
 * @param {Date|string} dateInMonth - Qualquer data do mês desejado (yyyy-MM-dd ou Date)
 * @returns {string} - Data no formato yyyy-MM-dd
 */
export function getFifthBusinessDay(dateInMonth) {
  let year, month;
  
  if (typeof dateInMonth === 'string') {
    const [y, m] = dateInMonth.split('-');
    year = parseInt(y);
    month = parseInt(m) - 1;
  } else {
    year = dateInMonth.getFullYear();
    month = dateInMonth.getMonth();
  }
  
  let businessDayCount = 0;
  let day = 1;

  // Itera pelos dias do mês até encontrar o 5º dia útil
  while (businessDayCount < 5) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    // 0 = domingo, 1 = segunda, ..., 6 = sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDayCount++;
    }
    if (businessDayCount < 5) {
      day++;
    }
  }

  // Formata como yyyy-MM-dd
  const month_ = String(month + 1).padStart(2, '0');
  const day_ = String(day).padStart(2, '0');
  
  return `${year}-${month_}-${day_}`;
}