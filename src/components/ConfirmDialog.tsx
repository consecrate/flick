import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmRequest {
  title: string;
  description?: string;
  /** Buttons after Cancel, last one first in reading order. Defaults to one "Delete" button. */
  actions?: { label: string; value: string; destructive?: boolean }[];
  cancelLabel?: string;
  resolve: (value: string | null) => void;
}

/** The dialog behind `ask()` in app-context. */
export function ConfirmDialog({ request: r, onDone }: { request: ConfirmRequest; onDone: (value: string | null) => void }) {
  const actions = r.actions ?? [{ label: 'Delete', value: 'ok', destructive: true }];
  return (
    <AlertDialog open onOpenChange={(open) => !open && onDone(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{r.title}</AlertDialogTitle>
          {r.description && <AlertDialogDescription>{r.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{r.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
          {actions.map((a) => (
            <Button key={a.value} variant={a.destructive ? 'destructive' : 'default'} onClick={() => onDone(a.value)}>
              {a.label}
            </Button>
          ))}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
