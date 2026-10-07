import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Toasts render their own cards (see app-context), so Sonner only positions and stacks them. */
function Toaster(props: ToasterProps) {
  return <Sonner position="bottom-right" gap={8} visibleToasts={5} toastOptions={{ unstyled: true }} {...props} />;
}

export { Toaster };
