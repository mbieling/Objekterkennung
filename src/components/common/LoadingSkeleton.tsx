import { Skeleton } from '@/components/ui/skeleton';

interface LoadingSkeletonProps {
  variant: 'page' | 'card-grid' | 'table' | 'form';
  count?: number;
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex justify-between items-start">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-4 w-48" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-4 w-36" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3 px-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-40 flex-1" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-8 w-8 rounded" />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6 max-w-2xl">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex gap-3 pt-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

export default function LoadingSkeleton({ variant, count = 6 }: LoadingSkeletonProps) {
  switch (variant) {
    case 'page':
      return (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: count }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      );

    case 'card-grid':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
          {Array.from({ length: count }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      );

    case 'table':
      return (
        <div className="rounded-xl border bg-card animate-fade-in">
          <div className="flex items-center gap-4 py-3 px-4 border-b bg-muted/50">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-8" />
          </div>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="border-b last:border-0">
              <TableRowSkeleton />
            </div>
          ))}
        </div>
      );

    case 'form':
      return (
        <div className="animate-fade-in">
          <FormSkeleton />
        </div>
      );
  }
}
