import { Card, CardContent } from '@/components/ui/card';
import EditableReviewCell from '@/components/data-review/EditableReviewCell';

export default function ReviewTable({ title, columns, rows, getColumnOptions, onCellChange, savingCellKey }) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {columns.map((column) => (
                  <th key={column.key} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-3 align-top text-foreground">
                        <EditableReviewCell
                          column={column}
                          row={row}
                          options={getColumnOptions?.(column, row) || []}
                          onChange={onCellChange}
                          isSaving={savingCellKey === `${row.id}:${column.key}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}