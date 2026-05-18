import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function parseCurrencyInput(value) {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value);

  if (text.includes('R$') || text.includes(',')) {
    const digits = text.replace(/\D/g, '');
    return digits ? Number(digits) / 100 : 0;
  }

  return Number.parseFloat(text) || 0;
}

export function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = parseCurrencyInput(value);
  if (!number) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
}

export const CurrencyInput = React.forwardRef(({ value, onChange, className, placeholder = 'R$ 0,00', ...props }, ref) => {
  const displayValue = formatCurrency(value);

  const handleChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '');
    if (!digits) {
      onChange?.('');
      return;
    }
    onChange?.(String(Number(digits) / 100));
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={cn('text-right', className)}
      {...props}
    />
  );
});

CurrencyInput.displayName = 'CurrencyInput';