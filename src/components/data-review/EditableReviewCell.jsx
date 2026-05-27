import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function EditableReviewCell({ column, row, options = [], onChange, isSaving }) {
  if (!column.editable || options.length === 0) {
    return <div className="max-w-[260px] break-words">{formatValue(row[column.key])}</div>;
  }

  return (
    <Select
      value={String(row[column.key] ?? '')}
      onValueChange={(value) => onChange(row, column, value)}
      disabled={isSaving}
    >
      <SelectTrigger className="h-8 min-w-[180px] bg-background">
        <SelectValue placeholder="Selecionar" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}