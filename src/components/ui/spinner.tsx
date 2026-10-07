import type * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return <LoaderCircleIcon role="status" aria-label="Loading" className={cn('size-4 animate-spin text-primary', className)} {...props} />;
}

export { Spinner };
