/**
 * Calcula o 5º dia útil de um mês (segunda a sexta, excluindo sábados e domingos)
 * @param {Date|string} dateInMonth - Qualquer data do mês desejado (yyyy-MM-dd ou Date)
 * @returns {string} - Data no formato yyyy-MM-dd
 */
export function getFifthBusinessDay(dateInMonth) {
  const date = typeof dateInMonth === 'string' 
    ? new Date(dateInMonth + 'T12:00:00')
    : new Date(dateInMonth);

  const year = date.getFullYear();
  const month = date.getMonth();
  
  let businessDayCount = 0;
  let currentDate = new Date(year, month, 1);

  // Itera pelos dias do mês até encontrar o 5º dia útil
  while (businessDayCount < 5) {
    const dayOfWeek = currentDate.getDay();
    // 0 = domingo, 1 = segunda, ..., 6 = sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDayCount++;
      if (businessDayCount === 5) break;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Formata como yyyy-MM-dd
  const year_ = currentDate.getFullYear();
  const month_ = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day_ = String(currentDate.getDate()).padStart(2, '0');
  
  return `${year_}-${month_}-${day_}`;
}